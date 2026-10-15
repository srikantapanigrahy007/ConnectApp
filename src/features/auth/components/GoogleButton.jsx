import { useEffect, useState } from 'react';
import { buttonClasses } from '../../../components/ui/button-styles';
import { Spinner } from '../../../components/ui/Spinner';

/** Google's brand mark is required by its sign-in guidelines, so it is inlined rather than taken from the icon set. */
function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.8z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.9l-3.88-3.02c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.11A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.28A7.2 7.2 0 0 1 4.91 12c0-.79.14-1.56.38-2.28V6.61H1.28a12 12 0 0 0 0 10.78l4.01-3.11z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.6 4.59 1.8l3.44-3.44A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.28 6.61l4.01 3.11C6.23 6.88 8.88 4.77 12 4.77z"
      />
    </svg>
  );
}

/**
 * Starts Google sign-in (a full-page navigation to the API). After the first click it shows a
 * spinner and ignores further clicks; it resets if the browser comes back to this page (Back).
 */
export function GoogleButton({ onClick, label }) {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const reset = () => setPending(false);
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);
  return (
    <button
      type="button"
      disabled={pending}
      aria-busy={pending || undefined}
      onClick={() => {
        if (pending) return;
        setPending(true);
        onClick();
      }}
      className={buttonClasses({ variant: 'secondary', fullWidth: true })}
    >
      {pending ? <Spinner className="size-4" /> : <GoogleMark />}
      {pending ? 'Redirecting to Google…' : label}
    </button>
  );
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-xs text-ink-muted" aria-hidden="true">
      <span className="h-px flex-1 bg-border" />
      or
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
