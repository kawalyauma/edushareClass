import { createLesson } from '@edushare/lesson-format';
import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStorage } from '../storage/context';
import { Button, EmptyState, ErrorBanner } from '../ui';
import { useAsync } from '../useAsync';

export function Home() {
  const storage = useStorage();
  const navigate = useNavigate();
  const load = useCallback(() => storage.list(), [storage]);
  const [state, reload] = useAsync(load);
  const [actionError, setActionError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');

  async function create() {
    try {
      setActionError(null);
      const lesson = createLesson({ id: crypto.randomUUID(), title: newTitle.trim() || 'Untitled lesson' });
      await storage.save(lesson);
      navigate(`/lesson/${lesson.id}`);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function remove(id: string) {
    try {
      setActionError(null);
      await storage.remove(id);
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="page">
      <div className="lesson-create">
        <div>
          <h1>Lessons</h1>
          <p className="lesson-subtitle">Create your own teaching board, with or without a PDF. Your projects stay in this browser.</p>
        </div>
        <label className="lesson-create-label">Lesson title
          <input aria-label="New lesson title" maxLength={200} value={newTitle}
            placeholder="e.g. P6 Mathematics — Fractions"
            onChange={event=>setNewTitle(event.target.value)}/>
        </label>
        <Button variant="primary" onClick={create}>New lesson</Button>
      </div>
      {actionError && <ErrorBanner message={actionError} />}
      {state.status === 'loading' && <p role="status">Loading lessons…</p>}
      {state.status === 'error' && <ErrorBanner message={state.error.message} onRetry={reload} />}
      {state.status === 'ready' && state.value.length === 0 && (
        <EmptyState
          title="No lessons yet"
          description="Create a lesson, type your own board notes, or select text and diagrams from a PDF."
        />
      )}
      {state.status === 'ready' && state.value.length > 0 && (
        <ul className="lesson-list" aria-label="Lessons">
          {state.value.map((l) => (
            <li key={l.id}>
              <Link to={`/lesson/${l.id}`}>{l.title}</Link>
              <Button
                variant="danger"
                aria-label={`Delete ${l.title}`}
                onClick={() => remove(l.id)}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
