import type { ExportPlan } from '@edushare/export-core';

export const CLOUD_RENDER_URL =
  'https://mti5fktou5jh4qxnl5lyox3hzm0vxomg.lambda-url.eu-north-1.on.aws';

const mediaType = (blob: Blob): 'video/webm' | 'video/mp4' => {
  const type = blob.type.split(';', 1)[0]?.toLowerCase();
  if (type === 'video/webm' || type === 'video/mp4') return type;
  throw new Error('Cloud export supports saved WebM or MP4 clips only.');
};

type UploadedClip = { segmentId: string; mimeType: 'video/webm' | 'video/mp4'; sizeBytes: number };
type CloudJob = {
  jobId: string;
  status:
    'awaiting_upload' | 'queued' | 'rendering' | 'retrying' | 'completed' | 'failed' | 'cancelled';
  uploads?: { segmentId: string; url: string; mimeType: string }[];
  downloadUrl?: string;
  sizeBytes?: number;
  progress?: number;
  error?: string;
};

export class CloudRenderError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = 'CloudRenderError';
  }
}

async function request<T>(
  token: string,
  path: string,
  method: 'GET' | 'POST' | 'DELETE',
  signal: AbortSignal,
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(CLOUD_RENDER_URL + path, {
      method,
      signal,
      cache: 'no-store',
      credentials: 'omit',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (e) {
    if (signal.aborted) throw e;
    throw new Error(
      'Cloud rendering service could not be reached. Check your internet connection.',
      { cause: e },
    );
  }
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok)
    throw new CloudRenderError(
      response.status,
      data.error ?? `Cloud export failed (${response.status}).`,
    );
  return data as T;
}

const cancelled = () => new DOMException('Cloud export cancelled.', 'AbortError');
const sleep = (duration: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(cancelled());
      return;
    }
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, duration);
    const abort = () => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      reject(cancelled());
    };
    signal.addEventListener('abort', abort, { once: true });
  });

export type CloudVideoResult = {
  jobId: string;
  downloadUrl: string;
  sizeBytes: number;
  mimeType: 'video/mp4';
};

export async function exportLessonCloud(options: {
  plan: ExportPlan;
  lessonTitle: string;
  readSegment: (segmentId: string) => Promise<Blob | null>;
  token: string;
  branding: { enabled: boolean; teacherName: string; caption: string };
  signal: AbortSignal;
  progress: (value: number) => void;
  notice: (message: string) => void;
  onQueued?: (jobId: string) => void;
}): Promise<CloudVideoResult> {
  const { plan, readSegment, token, signal, progress, notice } = options;
  if (signal.aborted) throw cancelled();
  const segments: UploadedClip[] = [];
  const unique = [...new Set(plan.clips.map((c) => c.segmentId))];
  if (unique.length > 40)
    throw new Error('Cloud export supports up to 40 different recording segments.');
  notice('Checking saved source recordings…');
  for (const [i, id] of unique.entries()) {
    if (signal.aborted) throw cancelled();
    const blob = await readSegment(id);
    if (!blob?.size) throw new Error(`Recorded video ${id} is missing on this browser.`);
    if (blob.size > 750 * 1024 * 1024)
      throw new Error('A recording exceeds the 750 MiB upload limit.');
    segments.push({ segmentId: id, mimeType: mediaType(blob), sizeBytes: blob.size });
    progress(Math.round((5 * i) / unique.length));
  }
  if (segments.reduce((sum, s) => sum + s.sizeBytes, 0) > 750 * 1024 * 1024)
    throw new Error('Cloud export uploads cannot exceed 750 MiB per lesson.');
  if (!token.trim()) throw new Error('Enter the four-digit uploader PIN.');

  let jobId: string | null = null;
  let queued = false;
  try {
    const created = await request<CloudJob>(token, '/v1/jobs', 'POST', signal, {
      lessonTitle: options.lessonTitle,
      segments,
      clips: plan.clips.map((c) => ({
        segmentId: c.segmentId,
        sourceInMs: c.sourceInMs,
        sourceOutMs: c.sourceOutMs,
        rate: c.rate,
      })),
      branding: options.branding,
    });
    if (!created.jobId || !created.uploads || created.uploads.length !== unique.length)
      throw new Error('Cloud server did not return valid private upload links.');
    jobId = created.jobId;
    for (const [i, upload] of created.uploads.entries()) {
      if (signal.aborted) throw cancelled();
      const descriptor = segments.find((s) => s.segmentId === upload.segmentId);
      if (!descriptor || descriptor.mimeType !== upload.mimeType)
        throw new Error('Cloud server returned a recording MIME mismatch.');
      const media = await readSegment(upload.segmentId);
      if (!media || media.size !== descriptor.sizeBytes)
        throw new Error('Saved recording changed while uploading; export cancelled.');
      const url = new URL(upload.url);
      if (url.protocol !== 'https:' || !url.hostname.endsWith('.amazonaws.com'))
        throw new Error('Server returned an unexpected upload destination.');
      notice(`Uploading private recording ${i + 1} of ${created.uploads.length}…`);
      const uploaded = await fetch(upload.url, {
        method: 'PUT',
        body: media,
        signal,
        credentials: 'omit',
        cache: 'no-store',
        headers: { 'Content-Type': upload.mimeType },
      });
      if (!uploaded.ok)
        throw new Error(`Recording upload ${i + 1} failed (HTTP ${uploaded.status}).`);
      progress(5 + Math.round((30 * (i + 1)) / created.uploads.length));
    }
    if (signal.aborted) throw cancelled();
    await request(token, `/v1/jobs/${jobId}`, 'POST', signal);
    queued = true;
    options.onQueued?.(jobId);
    notice('Recording uploaded. AWS is assembling the edited MP4…');
    progress(40);
    // The cloud worker can wake from a stopped EC2 state; limit the browser
    // wait without cancelling the remote job on transient network issues.
    const deadline = Date.now() + 2 * 60 * 60 * 1000;
    while (Date.now() < deadline) {
      if (signal.aborted) throw cancelled();
      const current = await request<CloudJob>(token, `/v1/jobs/${jobId}`, 'GET', signal);
      if (current.status === 'completed') {
        if (!current.downloadUrl || !current.sizeBytes)
          throw new Error('AWS reported success without a downloadable MP4.');
        progress(100);
        notice('AWS video export complete — your MP4 is ready.');
        return {
          jobId,
          downloadUrl: current.downloadUrl,
          sizeBytes: current.sizeBytes,
          mimeType: 'video/mp4',
        };
      }
      if (current.status === 'failed' || current.status === 'cancelled')
        throw new Error(current.error ?? `Cloud export ${current.status}.`);
      if (current.status === 'rendering') {
        progress(Math.max(40, Math.min(95, Math.round(40 + (current.progress ?? 0) * 0.55))));
        notice('AWS is rendering the video. You can keep using the browser.');
      } else if (current.status === 'retrying') {
        notice('AWS is retrying the export after a temporary failure.');
      } else {
        notice('Queued for the secure AWS rendering server…');
      }
      await sleep(3500, signal);
    }
    throw new Error('The cloud render is taking longer than two hours. The job may still finish.');
  } catch (error) {
    if (signal.aborted && jobId) {
      // Best-effort cancellation: do not leave an unwanted cloud job running.
      try {
        await request(token, `/v1/jobs/${jobId}`, 'DELETE', new AbortController().signal);
      } catch {
        /* network or already finished */
      }
    }
    // If a temporary download-link/network error happened after queueing, the
    // server may still complete successfully. The job ID remains in the status text.
    if (jobId && queued && !signal.aborted) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)} Job reference: ${jobId}`,
        { cause: error },
      );
    }
    throw error;
  }
}

/** Re-open a previously queued AWS job with a fresh signed download URL. */
export async function checkCloudRenderJob(
  token: string,
  jobId: string,
  signal: AbortSignal,
): Promise<{
  status: CloudJob['status'];
  error?: string;
  downloadUrl?: string;
  sizeBytes?: number;
}> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(jobId))
    throw new Error('Saved AWS export job reference is invalid.');
  if (!token.trim()) throw new Error('Enter the four-digit uploader PIN.');
  return request(token, `/v1/jobs/${jobId}`, 'GET', signal);
}
