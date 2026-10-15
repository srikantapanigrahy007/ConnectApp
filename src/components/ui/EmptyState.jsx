import { cn } from '../../lib/cn';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  badge,
  className,
  headingLevel = 3,
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <div className={cn('flex flex-col items-center px-6 py-10 text-center', className)}>
      {Icon ? (
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary-50 text-primary-600">
          <Icon aria-hidden="true" className="size-6" />
        </div>
      ) : null}
      {badge ? <div className="mb-2">{badge}</div> : null}
      <Heading className="text-sm font-semibold text-ink">{title}</Heading>
      {description ? <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
