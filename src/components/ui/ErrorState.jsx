import { CircleAlert, RefreshCw } from 'lucide-react';
import { Button } from './Button';

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  isRetrying = false,
}) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-danger-200 bg-danger-50 p-4"
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-danger-700" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-danger-700">{title}</p>
        <p className="mt-0.5 text-sm text-ink-muted">{message}</p>
        {onRetry ? (
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            className="mt-3"
            onClick={onRetry}
            loading={isRetrying}
          >
            {isRetrying ? 'Retrying…' : 'Try again'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
