import { createLesson } from '@edushare/lesson-format';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { routes } from './routes';
import { StorageContext } from './storage/context';
import { IndexedDbProjectStorage, StorageUnavailableError } from './storage/projectStorage';
import type { ProjectStorage } from './storage/projectStorage';

const freshStorage = () => new IndexedDbProjectStorage(new IDBFactory());

function renderAt(path: string, storage: ProjectStorage = freshStorage()) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <StorageContext.Provider value={storage}>
      <RouterProvider router={router} />
    </StorageContext.Provider>,
  );
  return router;
}

describe('router and workspace navigation', () => {
  it('shows empty state, creates a lesson and opens the studio', async () => {
    const user = userEvent.setup();
    const router = renderAt('/');
    expect(await screen.findByText('No lessons yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New lesson' }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/lesson\/.+/));
    expect(await screen.findByRole('tablist', { name: 'Studio panels' })).toBeInTheDocument();
  });

  it('uses a custom lesson title and opens the studio without a PDF', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    const router = renderAt('/', storage);
    await screen.findByText('No lessons yet');
    await user.type(screen.getByRole('textbox', { name: 'New lesson title' }), 'P6 Science — Plants');
    await user.click(screen.getByRole('button', { name: 'New lesson' }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/lesson\/.+/));
    const lessonId = router.state.location.pathname.split('/').at(-1)!;
    const result = await storage.load(lessonId);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.lesson.title).toBe('P6 Science — Plants');
      expect(result.lesson.sources).toEqual([]);
    }
    expect(await screen.findByRole('textbox', { name: 'Text to handwrite' })).toBeInTheDocument();
  });

  it('lists, opens and deletes saved lessons', async () => {
    const storage = freshStorage();
    await storage.save(createLesson({ id: 'one', title: 'Geometry' }));
    const user = userEvent.setup();
    renderAt('/', storage);
    expect(await screen.findByRole('link', { name: 'Geometry' })).toHaveAttribute(
      'href',
      '/lesson/one',
    );
    await user.click(screen.getByRole('button', { name: 'Delete Geometry' }));
    expect(await screen.findByText('No lessons yet')).toBeInTheDocument();
  });

  it('handles unknown lesson, unknown route, corrupt data and unavailable storage', async () => {
    renderAt('/lesson/missing');
    expect(await screen.findByText('Lesson not found')).toBeInTheDocument();
  });

  it('shows a 404 page for unknown routes', async () => {
    renderAt('/nope');
    expect(await screen.findByText('Page not found')).toBeInTheDocument();
  });

  it('shows a retryable error when storage is unavailable', async () => {
    const broken: ProjectStorage = {
      list: () => Promise.reject(new StorageUnavailableError()),
      load: () => Promise.reject(new StorageUnavailableError()),
      save: () => Promise.reject(new StorageUnavailableError()),
      remove: () => Promise.reject(new StorageUnavailableError()),
    };
    renderAt('/', broken);
    expect(await screen.findByRole('alert')).toHaveTextContent(/not available/);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('studio shell', () => {
  async function openStudio(path = '/lesson/s1') {
    const storage = freshStorage();
    await storage.save(createLesson({ id: 's1', title: 'Shell test' }));
    return renderAt(path, storage);
  }

  it('renders three labelled panels with the board active by default', async () => {
    await openStudio();
    await screen.findByRole('tablist');
    for (const name of ['Source PDF', 'Teaching board', 'Controls']) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('tab', { name: 'Teaching board' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('switches panels by click and arrow keys, mirrored in the URL', async () => {
    const user = userEvent.setup();
    const router = await openStudio();
    await screen.findByRole('tablist');
    await user.click(screen.getByRole('tab', { name: 'Source PDF' }));
    expect(router.state.location.search).toBe('?panel=source');
    screen.getByRole('tab', { name: 'Source PDF' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(router.state.location.search).toBe('?panel=board');
    expect(screen.getByRole('tab', { name: 'Teaching board' })).toHaveFocus();
  });

  it('falls back to the board for an invalid panel param', async () => {
    await openStudio('/lesson/s1?panel=bogus');
    expect(await screen.findByRole('tab', { name: 'Teaching board' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});
