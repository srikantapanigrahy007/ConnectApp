import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../lib/cn';

export const controlBase =
  'w-full rounded-lg border border-border-strong bg-surface text-sm text-ink placeholder:text-ink-subtle shadow-xs transition-colors hover:border-ink-subtle disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-muted disabled:text-ink-muted aria-invalid:border-danger-600 focus-visible:border-primary-600';

export function Input({ leadingIcon: Icon, className, ref, ...props }) {
  const input = (
    <input
      ref={ref}
      className={cn(controlBase, 'h-10 px-3', Icon && 'pl-9', className)}
      {...props}
    />
  );
  if (!Icon) return input;
  return (
    <div className="relative">
      <Icon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle"
      />
      {input}
    </div>
  );
}

export function PasswordInput({ className, ...props }) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;
  return (
    <div className="relative">
      <Input type={visible ? 'text' : 'password'} className={cn('pr-11', className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        disabled={props.disabled}
        className="absolute top-1/2 right-1 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink disabled:opacity-50"
      >
        <Icon aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
