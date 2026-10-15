import { cn } from '../../lib/cn';

export function Skeleton({ className }) {
  return (
    <div
      aria-hidden="true"
      className={cn('rounded-md bg-surface-muted motion-safe:animate-pulse', className)}
    />
  );
}

/** Placeholder for a list of avatar + two-line rows (conversations, users, notifications). */
export function ListSkeleton({ rows = 4, label = 'Loading…' }) {
  return (
    <div role="status" className="divide-y divide-border">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
