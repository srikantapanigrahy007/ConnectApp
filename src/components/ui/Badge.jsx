import { cn } from '../../lib/cn';

const tones = {
  neutral: { badge: 'bg-surface-muted text-ink-muted ring-border', dot: 'bg-ink-subtle' },
  primary: { badge: 'bg-primary-50 text-primary-700 ring-primary-200', dot: 'bg-primary-500' },
  success: { badge: 'bg-success-50 text-success-700 ring-success-200', dot: 'bg-success-500' },
  warning: { badge: 'bg-warning-50 text-warning-800 ring-warning-200', dot: 'bg-warning-500' },
  danger: { badge: 'bg-danger-50 text-danger-700 ring-danger-200', dot: 'bg-danger-600' },
};

export function Badge({ tone = 'neutral', dot = false, className, children }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
        tones[tone].badge,
        className,
      )}
    >
      {dot ? (
        <span aria-hidden="true" className={cn('size-1.5 rounded-full', tones[tone].dot)} />
      ) : null}
      {children}
    </span>
  );
}

/** Compact numeric badge (unread counts). Provide context for screen readers via `label`. */
export function CountBadge({ count, label, max = 99 }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-600 px-1.5 text-xs font-semibold text-white">
      <span aria-hidden="true">{count > max ? `${max}+` : count}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Marks a feature that exists in the UI but is not implemented yet. */
export function NotImplementedBadge({ className }) {
  return (
    <Badge tone="warning" className={className}>
      Not available yet
    </Badge>
  );
}
