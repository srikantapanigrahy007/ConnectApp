import { Link } from 'react-router';
import { buttonClasses } from './button-styles';
import { Spinner } from './Spinner';

const iconSize = { sm: 'size-4', md: 'size-4', lg: 'size-5' };

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth,
  loading = false,
  icon: Icon,
  type = 'button',
  disabled,
  className,
  children,
  ...props
}) {
  return (
    <button
      type={type}
      disabled={Boolean(disabled) || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, fullWidth, className })}
      {...props}
    >
      {loading ? (
        <Spinner className={iconSize[size]} />
      ) : Icon ? (
        <Icon aria-hidden="true" className={iconSize[size]} />
      ) : null}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  icon: Icon,
  variant = 'ghost',
  size = 'md',
  type = 'button',
  className,
  ...props
}) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={buttonClasses({ variant, size, iconOnly: true, className })}
      {...props}
    >
      <Icon aria-hidden="true" className={size === 'lg' ? 'size-5' : 'size-[1.125rem]'} />
    </button>
  );
}

/** A router link styled as a button, for navigation actions. */
export function ButtonLink({
  variant = 'primary',
  size = 'md',
  fullWidth,
  icon: Icon,
  className,
  children,
  ...props
}) {
  return (
    <Link
      className={buttonClasses({
        variant,
        size,
        fullWidth,
        className: typeof className === 'string' ? className : undefined,
      })}
      {...props}
    >
      {Icon ? <Icon aria-hidden="true" className={iconSize[size]} /> : null}
      {children}
    </Link>
  );
}
