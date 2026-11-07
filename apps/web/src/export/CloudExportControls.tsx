import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BoardStudio } from '../board/useBoardStudio';
import { LocalMediaChunks } from '../recording/mediaStore';
import { planCloudExport, exportMetadata } from '@edushare/export-core';
import { exportLessonCloud, checkCloudRenderJob } from './cloudExport';
import { brandText } from './videoBranding';

/**
 * Teacher explicitly opts in to uploading saved recordings to private AWS.
 * No credentials or teaching media are bundled into the public frontend.
 */
export function CloudExportControls({ studio }: { studio: BoardStudio }) {
  const store = useMemo(() => new LocalMediaChunks(), []);
  const jobStorageKey = `edushareclass-aws-render:${studio.lesson.id}`;
  const [lastJobId, setLastJobId] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(jobStorageKey);
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState('');
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [notice, setNotice] = useState(
    'Cloud export is optional. No recordings have been uploaded.',
  );
  const [output, setOutput] = useState<{
    mp4: string;
    manifest: string;
    jobId: string;
    sizeBytes: number;
  } | null>(null);
  const [branded, setBranded] = useState(true);
  const [teacherName, setTeacherName] = useState('');
  const [caption, setCaption] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const metadataRef = useRef<string | null>(null);
  const brand = useMemo(
    () => ({ enabled: branded, lessonTitle: studio.lesson.title, teacherName }),
    [branded, studio.lesson.title, teacherName],
  );
  const timing = branded ? { introMs: 2200, outroMs: 2000 } : { introMs: 0, outroMs: 0 };
  const plan = useMemo(() => {
    try {
      return { ok: true as const, value: planCloudExport(studio.lesson) };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  }, [studio.lesson]);
  const clear = useCallback(() => {
    if (metadataRef.current) URL.revokeObjectURL(metadataRef.current);
    metadataRef.current = null;
    setOutput(null);
  }, []);
  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (metadataRef.current) URL.revokeObjectURL(metadataRef.current);
    },
    [],
  );

  const start = useCallback(async () => {
    if (working || !plan.ok) return;
    if (!/^\d{4}$/.test(token.trim())) {
      setNotice('Enter the 4-digit uploader PIN first.');
      return;
    }
    const abort = new AbortController();
    abortRef.current = abort;
    clear();
    setWorking(true);
    setProgress(0);
    try {
      const result = await exportLessonCloud({
        plan: plan.value,
        lessonTitle: studio.lesson.title,
        readSegment: (id) => store.toBlob(studio.lesson.id, id),
        token: token.trim(),
        branding: { enabled: branded, teacherName, caption },
        signal: abort.signal,
        progress: setProgress,
        notice: setNotice,
        onQueued: (id) => {
          setLastJobId(id);
          // A non-secret job reference makes cloud export recoverable after
          // a tab refresh. Never save uploader PINs to storage.
          try {
            window.localStorage.setItem(jobStorageKey, id);
          } catch {
            /* storage disabled */
          }
        },
      });
      const manifest = {
        ...exportMetadata(studio.lesson, plan.value, 'video/mp4'),
        cloudRender: {
          jobId: result.jobId,
          region: 'eu-north-1',
          provider: 'AWS',
          exportType: 'server-side-ffmpeg',
          notesugBranding: {
            enabled: branded,
            ...brandText(brand),
            introMs: branded ? 2200 : 0,
            outroMs: branded ? 2000 : 0,
            plannedOutputDurationMs: plan.value.durationMs + (branded ? 4200 : 0),
          },
        },
      };
      const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      metadataRef.current = url;
      setOutput({
        jobId: result.jobId,
        mp4: result.downloadUrl,
        manifest: url,
        sizeBytes: result.sizeBytes,
      });
      setNotice(
        'AWS MP4 export completed. Download your video before the private link expires (15 minutes).',
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      abortRef.current = null;
      setWorking(false);
    }
  }, [
    working,
    plan,
    token,
    studio.lesson,
    clear,
    store,
    branded,
    teacherName,
    caption,
    brand,
    jobStorageKey,
  ]);

  const recheck = useCallback(async () => {
    if (working || !lastJobId || !/^\d{4}$/.test(token.trim())) return;
    setWorking(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const job = await checkCloudRenderJob(token.trim(), lastJobId, controller.signal);
      if (job.status === 'completed' && job.downloadUrl && job.sizeBytes) {
        clear();
        setOutput({
          mp4: job.downloadUrl,
          manifest: '',
          jobId: lastJobId,
          sizeBytes: job.sizeBytes,
        });
        setProgress(100);
        setNotice(
          'AWS MP4 finished. Download with this freshly renewed private link (valid 15 minutes).',
        );
      } else if (job.status === 'failed' || job.status === 'cancelled') {
        setNotice(job.error ?? `AWS job ${job.status}. Start another export if necessary.`);
      } else {
        setNotice(
          `Your earlier AWS export is ${job.status}. Click Check last AWS export again shortly.`,
        );
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      abortRef.current = null;
      setWorking(false);
    }
  }, [working, lastJobId, token, clear]);

  return (
    <section aria-label="AWS cloud MP4 export" className="cloud-sync">
      <h3>Cloud MP4 export — loud, clear voice on AWS</h3>
      <p className="board-note">
        Your device uploads the saved original clips; the private AWS server handles trimming,
        encoding and joining. The AWS speech engine enhances the captured teacher voice with noise
        reduction, automatic volume recovery, warmth and presence EQ, and a peak-safe loudness
        boost. No synthetic speech is added. Files are sent only after you click export.
      </p>
      {plan.ok ? (
        <p className="board-note">
          {plan.value.clips.length} edited clip(s) · {(plan.value.durationMs / 60000).toFixed(1)}{' '}
          min · up to 30 minutes and 750 MiB · 1080p H.264/AAC MP4
        </p>
      ) : (
        <p role="alert" className="pdf-inline-error">
          {plan.error}
        </p>
      )}
      <label>
        Uploader PIN
        <input
          type="password"
          value={token}
          autoComplete="off"
          inputMode="numeric"
          pattern="[0-9]{4}"
          maxLength={4}
          placeholder="Enter PIN"
          disabled={working}
          onChange={(e) => setToken(e.target.value)}
        />
      </label>
      <fieldset className="video-branding-options">
        <legend>NotesUG Academy presentation</legend>
        <label>
          <input
            type="checkbox"
            checked={branded}
            disabled={working}
            onChange={(e) => setBranded(e.target.checked)}
          />
          Add a NotesUG title card, watermark and closing screen
        </label>
        <label>
          Teacher name (optional)
          <input
            value={teacherName}
            maxLength={60}
            disabled={!branded || working}
            onChange={(e) => setTeacherName(e.target.value)}
          />
        </label>
        <label>
          On-screen caption (optional)
          <input
            value={caption}
            maxLength={40}
            disabled={!branded || working}
            onChange={(e) => setCaption(e.target.value)}
          />
        </label>
        {branded && (
          <p className="board-note">
            The cloud renderer includes a {(timing.introMs / 1000).toFixed(1)}-second opening and a{' '}
            {(timing.outroMs / 1000).toFixed(1)}-second closing screen. These title screens have no
            added music.
          </p>
        )}
      </fieldset>
      <div className="board-control-row">
        <button
          className="btn"
          type="button"
          disabled={working || !plan.ok || !/^\d{4}$/.test(token.trim())}
          onClick={() => void start()}
        >
          {working ? 'Exporting on AWS…' : 'Export MP4 on AWS'}
        </button>
        <button
          className="btn"
          type="button"
          disabled={!working}
          onClick={() => abortRef.current?.abort()}
        >
          Cancel upload/export
        </button>
      </div>
      {lastJobId && (
        <div className="board-control-row">
          <button
            className="btn"
            type="button"
            disabled={working || !/^\d{4}$/.test(token.trim())}
            onClick={() => void recheck()}
          >
            Check last AWS export / renew download link
          </button>
          <span className="board-note">Saved AWS job: {lastJobId}</span>
        </div>
      )}
      <progress value={progress} max="100" aria-label="AWS video export progress" />
      {output && (
        <div className="board-control-row">
          <a className="btn" href={output.mp4} target="_blank" rel="noopener noreferrer">
            Download exported MP4 ({Math.round(output.sizeBytes / 1024 / 1024)} MiB)
          </a>
          {output.manifest && (
            <a
              className="btn"
              href={output.manifest}
              download={`${studio.lesson.id}-aws-export-manifest.json`}
            >
              Download edit/source manifest
            </a>
          )}
        </div>
      )}
      {output && <p className="board-note">Job reference: {output.jobId}</p>}
      <p role="status">{notice}</p>
      <p className="board-note">
        The shared uploader PIN grants limited access; it is not a personal account login. Daily
        quotas protect the server from excessive costs. Original videos are deleted from AWS after
        seven days and exports after thirty days. The PIN is not saved in the lesson. Original
        lesson recordings remain on this device.
      </p>
    </section>
  );
}
