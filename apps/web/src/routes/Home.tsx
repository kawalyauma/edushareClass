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

  async function create() {
    try {
      setActionError(null);
      const lesson = createLesson({ id: crypto.randomUUID(), title: 'Untitled lesson' });
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Lessons</h1>
        <Button variant="primary" onClick={create}>
          New lesson
        </Button>
      </div>
      {actionError && <ErrorBanner message={actionError} />}
      {state.status === 'loading' && <p role="status">Loading lessons…</p>}
      {state.status === 'error' && <ErrorBanner message={state.error.message} onRetry={reload} />}
      {state.status === 'ready' && state.value.length === 0 && (
        <EmptyState
          title="No lessons yet"
          description="Create a lesson, then pick a PDF to start teaching on the board."
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
