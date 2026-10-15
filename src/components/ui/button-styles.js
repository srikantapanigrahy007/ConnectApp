import { cn } from '../../lib/cn';

const base =
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50';

const variants = {
  primary:
    'bg-primary-600 text-white shadow-sm hover:bg-primary-700 active:bg-primary-800 disabled:hover:bg-primary-600',
  secondary:
    'border border-border bg-surface text-ink shadow-sm hover:bg-surface-muted active:bg-primary-50 disabled:hover:bg-surface',
  ghost: 'text-ink-muted hover:bg-surface-muted hover:text-ink active:bg-primary-50',
  danger:
    'bg-danger-600 text-white shadow-sm hover:bg-danger-700 active:bg-danger-700 disabled:hover:bg-danger-600',
};

const sizes = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-5 text-base',
};

const iconSizes = {
  sm: 'size-8',
  md: 'size-10',
  lg: 'size-11',
};

export function buttonClasses({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  iconOnly = false,
  className,
} = {}) {
  return cn(
    base,
    variants[variant],
    iconOnly ? iconSizes[size] : sizes[size],
    fullWidth && 'w-full',
    className,
  );
}
