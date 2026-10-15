import { useId } from 'react';

/** Label + control + hint + error, with ids and ARIA wired for screen readers. */
export function Field({ label, hint, error, labelAction, optional, children }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
          {optional ? <span className="font-normal text-ink-muted"> (optional)</span> : null}
        </label>
        {labelAction}
      </div>
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
      })}
      {error ? (
        <p id={errorId} className="text-sm text-danger-700">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
