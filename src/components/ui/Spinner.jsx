import { LoaderCircle } from 'lucide-react';
import { cn } from '../../lib/cn';

/** Decorative spinner. Pair it with visible or screen-reader text describing what is loading. */
export function Spinner({ className }) {
  return (
    <LoaderCircle
      aria-hidden="true"
      className={cn('size-4 shrink-0 motion-safe:animate-spin', className)}
    />
  );
}

/** Centered loading indicator for a whole page or panel. */
export function PageSpinner({ label = 'Loading…' }) {
  return (
    <div role="status" className="flex h-full min-h-48 items-center justify-center gap-2 p-8">
      <Spinner className="size-5 text-primary-600" />
      <span className="text-sm text-ink-muted">{label}</span>
    </div>
  );
}
