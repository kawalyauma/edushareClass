import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';

export function Button({
  variant = 'default',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'danger' }) {
  return <button type="button" className="btn" data-variant={variant} {...props} />;
}

export function Panel({
  title,
  children,
  ...rest
}: { title: string; children: ReactNode } & Omit<React.HTMLAttributes<HTMLElement>, 'title'>) {
  const headingId = useId();
  return (
    <section className="panel" aria-labelledby={headingId} {...rest}>
      <h2 id={headingId}>{title}</h2>
      <div className="panel-body">{children}</div>
    </section>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="error-banner">
      <p style={{ margin: 0 }}>{message}</p>
      {onRetry && (
        <Button onClick={onRetry} style={{ marginTop: 8 }}>
          Try again
        </Button>
      )}
    </div>
  );
}
