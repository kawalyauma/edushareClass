import { Link, Outlet } from 'react-router-dom';

export function Layout() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="app-header">
        <Link to="/">EduShareClass</Link>
        <span style={{ color: 'var(--color-text-muted)' }}>Smart Teaching Board</span>
      </header>
      <main id="main">
        <Outlet />
      </main>
    </>
  );
}
