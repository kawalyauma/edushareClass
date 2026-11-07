import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  exportLessonCloud,
  checkCloudRenderJob,
  CloudRenderError,
  CLOUD_RENDER_URL,
} from './cloudExport';
import type { ExportPlan } from '@edushare/export-core';

const plan: ExportPlan = {
  width: 1920,
  height: 1080,
  fps: 30,
  durationMs: 1800,
  clips: [
    {
      clipId: 'clip-a',
      segmentId: 'segment-a',
      sourceInMs: 100,
      sourceOutMs: 1900,
      rate: 1,
      targetStartMs: 0,
      targetEndMs: 1800,
    },
  ],
};
const source = new Blob(['recording-bytes'], { type: 'video/webm;codecs=vp9,opus' });
const upload =
  'https://edushare-render-417081976539-eu-north-1.s3.eu-north-1.amazonaws.com/uploads/test/segment-a.webm';

const options = () => ({
  plan,
  lessonTitle: 'Science with real teacher narration',
  readSegment: vi.fn(async () => source),
  token: 'a-private-user-supplied-access-code-that-is-not-stored',
  branding: { enabled: true, teacherName: 'Teacher', caption: 'Safety' },
  signal: new AbortController().signal,
  progress: vi.fn(),
  notice: vi.fn(),
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('private AWS cloud video export', () => {
  it('uploads the original source clip once and downloads a server-rendered MP4 URL', async () => {
    let fetchCount = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      fetchCount++;
      if (url === CLOUD_RENDER_URL + '/v1/jobs' && init?.method === 'POST') {
        expect(init.headers).toMatchObject({ Authorization: expect.stringMatching(/^Bearer /) });
        const request = JSON.parse(String(init.body)) as {
          segments: { segmentId: string; mimeType: string; sizeBytes: number }[];
          clips: { segmentId: string; sourceInMs: number; sourceOutMs: number }[];
        };
        expect(request.segments).toEqual([
          { segmentId: 'segment-a', mimeType: 'video/webm', sizeBytes: source.size },
        ]);
        expect(request.clips).toMatchObject([
          { segmentId: 'segment-a', sourceInMs: 100, sourceOutMs: 1900 },
        ]);
        return new Response(
          JSON.stringify({
            jobId: '11111111-1111-4111-8111-111111111111',
            uploads: [{ segmentId: 'segment-a', url: upload, mimeType: 'video/webm' }],
          }),
          { status: 201 },
        );
      }
      if (url === upload) {
        expect(init?.method).toBe('PUT');
        expect(init?.body).toBe(source);
        expect(init?.credentials).toBe('omit');
        return new Response('', { status: 200 });
      }
      if (url.endsWith('/v1/jobs/11111111-1111-4111-8111-111111111111')) {
        if (init?.method === 'POST')
          return new Response(JSON.stringify({ status: 'queued' }), { status: 202 });
        if (init?.method === 'GET')
          return new Response(
            JSON.stringify({
              jobId: '11111111-1111-4111-8111-111111111111',
              status: 'completed',
              sizeBytes: 2048,
              downloadUrl: 'https://example.s3.eu-north-1.amazonaws.com/rendered.mp4',
            }),
            { status: 200 },
          );
      }
      throw new Error('Unexpected request ' + url);
    });
    vi.stubGlobal('fetch', fetchMock);
    const args = { ...options(), onQueued: vi.fn() };
    const result = await exportLessonCloud(args);
    expect(args.onQueued).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
    expect(result).toMatchObject({
      mimeType: 'video/mp4',
      sizeBytes: 2048,
      jobId: '11111111-1111-4111-8111-111111111111',
    });
    expect(args.progress).toHaveBeenCalledWith(100);
    expect(args.readSegment).toHaveBeenCalledTimes(2);
    expect(fetchCount).toBe(4);
  });

  it('refuses missing recordings without sending private media', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const args = options();
    args.readSegment = vi.fn(async () => null) as typeof args.readSegment;
    await expect(exportLessonCloud(args)).rejects.toThrow(/missing on this browser/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not send access requests when export has been cancelled', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(exportLessonCloud({ ...options(), signal: ctrl.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('displays authentication failure when the private access code is invalid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'Invalid rendering access code' }), { status: 401 }),
      ),
    );
    await expect(exportLessonCloud(options())).rejects.toBeInstanceOf(CloudRenderError);
  });
});

describe('recover previous cloud video jobs', () => {
  it('can request a renewed signed MP4 link without uploading again', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            jobId: '11111111-1111-4111-8111-111111111111',
            status: 'completed',
            sizeBytes: 9123,
            downloadUrl: 'https://s3.eu-north-1.amazonaws.com/private/video.mp4',
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const response = await checkCloudRenderJob(
      'private-one-time-code',
      '11111111-1111-4111-8111-111111111111',
      new AbortController().signal,
    );
    expect(response.status).toBe('completed');
    expect(response.downloadUrl).toContain('.mp4');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      CLOUD_RENDER_URL + '/v1/jobs/11111111-1111-4111-8111-111111111111',
    );
  });
  it('rejects modified or corrupt saved job references', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      checkCloudRenderJob('private-code', '../../bad', new AbortController().signal),
    ).rejects.toThrow(/reference is invalid/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
