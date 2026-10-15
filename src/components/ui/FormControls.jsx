import { ChevronDown } from 'lucide-react';
import { useId } from 'react';
import { cn } from '../../lib/cn';
import { controlBase } from './Input';

export function Textarea({ className, ...props }) {
  return (
    <textarea className={cn(controlBase, 'min-h-24 resize-y px-3 py-2', className)} {...props} />
  );
}

export function Select({ className, children, ...props }) {
  return (
    <div className="relative">
      <select className={cn(controlBase, 'h-10 appearance-none pr-9 pl-3', className)} {...props}>
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-muted"
      />
    </div>
  );
}

export function Checkbox({ label, description, className, id, ...props }) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = `${inputId}-description`;
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <input
        id={inputId}
        type="checkbox"
        aria-describedby={description ? descriptionId : undefined}
        className="mt-0.5 size-4 shrink-0 rounded border-border-strong accent-primary-600 disabled:cursor-not-allowed"
        {...props}
      />
      <div className="text-sm">
        <label htmlFor={inputId} className="font-medium text-ink">
          {label}
        </label>
        {description ? (
          <p id={descriptionId} className="text-ink-muted">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Accessible on/off switch (role="switch"). Provide labelledBy or label. */
export function Switch({ checked, onCheckedChange, disabled, labelledBy, describedBy, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-label={labelledBy ? undefined : label}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-primary-600' : 'bg-border-strong',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-5 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  );
}
