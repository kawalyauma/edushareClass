import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lesson } from '@edushare/shared-types';
import { PdfReader } from '../pdf/PdfReader';
import { Link, useParams } from 'react-router-dom';
import { StudioShell } from '../shell/StudioShell';
import { useStorage } from '../storage/context';
import { EmptyState, ErrorBanner } from '../ui';
import {BoardCanvas} from '../board/BoardCanvas';
import {BoardControls} from '../board/BoardControls';
import {useBoardStudio} from '../board/useBoardStudio';
import {useLessonRecording} from '../recording/useLessonRecording';
import { useAsync } from '../useAsync';

export function LessonWorkspace() {
  const { lessonId = '' } = useParams();
  const storage = useStorage();
  const load = useCallback(() => storage.load(lessonId), [storage, lessonId]);
  const [state, reload] = useAsync(load);
  const [edited, setEdited] = useState<Lesson | null>(null);
  useEffect(() => setEdited(null), [lessonId]);

  if (state.status === 'loading')
    return (
      <p role="status" className="page">
        Opening lesson…
      </p>
    );
  if (state.status === 'error')
    return (
      <div className="page">
        <ErrorBanner message={state.error.message} onRetry={reload} />
      </div>
    );
  const r = state.value;
  if (!r.ok && r.reason === 'not-found')
    return (
      <div className="page">
        <EmptyState
          title="Lesson not found"
          description="It may have been deleted, or it lives in another browser profile."
          action={<Link to="/">Back to lessons</Link>}
        />
      </div>
    );
  if (!r.ok)
    return (
      <div className="page">
        <ErrorBanner
          message={`This lesson file is damaged and cannot be opened: ${r.errors[0] ?? 'unknown error'}`}
        />
        <p>
          <Link to="/">Back to lessons</Link>
        </p>
      </div>
    );

  const lesson = edited ?? r.lesson;
  async function saveLesson(next: Lesson) {
    await storage.save(next);
    setEdited(next);
  }
  return <OpenedLesson lesson={lesson} saveLesson={saveLesson} />;
}

/** Only mount the board controller after IndexedDB has loaded a valid lesson. */
function OpenedLesson({lesson,saveLesson}: {lesson:Lesson;saveLesson:(next:Lesson)=>Promise<void>}) {
  const studio=useBoardStudio(lesson,saveLesson);
  const boardCanvas=useRef<HTMLCanvasElement|null>(null);
  const recording=useLessonRecording(studio,boardCanvas);
  return <>
    <h1 className="skip-link">{lesson.title}</h1>
    <StudioShell
      source={<PdfReader lesson={studio.lesson} saveLesson={saveLesson}/>}
      board={<BoardCanvas studio={studio} captureRef={boardCanvas}/>}
      controls={<BoardControls studio={studio} recording={recording}/>}
    />
  </>;
}
