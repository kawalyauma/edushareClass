import { Link } from 'react-router-dom';
import { EmptyState } from '../ui';

export function NotFound() {
  return (
    <div className="page">
      <EmptyState title="Page not found" action={<Link to="/">Back to lessons</Link>} />
    </div>
  );
}
