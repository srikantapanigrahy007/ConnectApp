import { cn } from '../../lib/cn';

export function Card({ className, ...props }) {
  return (
    <section
      className={cn('rounded-xl border border-border bg-surface shadow-sm', className)}
      {...props}
    />
  );
}

export function CardHeader({ title, description, action, titleId }) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
      <div className="min-w-0">
        <h2 id={titleId} className="text-base font-semibold text-ink">
          {title}
        </h2>
        {description ? <p className="mt-0.5 text-sm text-ink-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function CardBody({ className, ...props }) {
  return <div className={cn('px-5 py-4', className)} {...props} />;
}
