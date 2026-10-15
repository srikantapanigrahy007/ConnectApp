import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../lib/cn';
import { ToastContext } from './toast-context';

const DEFAULT_DURATION_MS = 6_000;
const MAX_VISIBLE = 4;

const tones = {
  info: { icon: Info, color: 'text-primary-700' },
  success: { icon: CircleCheck, color: 'text-success-700' },
  warning: { icon: TriangleAlert, color: 'text-warning-800' },
  danger: { icon: CircleAlert, color: 'text-danger-700' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const toast = useCallback(
    ({ title, description, tone = 'info', durationMs }) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, title, description, tone }].slice(-MAX_VISIBLE));
      const duration = durationMs ?? (tone === 'danger' ? undefined : DEFAULT_DURATION_MS);
      if (duration !== undefined) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext value={value}>
      {children}
      {/* The live region is always mounted so screen readers announce toasts reliably. */}
      <section
        aria-label="Status messages"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:inset-x-auto md:right-4 md:bottom-4 md:items-end"
      >
        {toasts.map((item) => {
          const { icon: Icon, color } = tones[item.tone];
          return (
            <div
              key={item.id}
              role={item.tone === 'danger' ? 'alert' : undefined}
              className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-border bg-surface p-4 shadow-lg"
            >
              <Icon aria-hidden="true" className={cn('mt-0.5 size-5 shrink-0', color)} />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold text-ink">{item.title}</p>
                {item.description ? (
                  <p className="mt-0.5 text-ink-muted">{item.description}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label="Dismiss notification"
                className="-m-1 rounded-md p-1 text-ink-muted hover:bg-surface-muted hover:text-ink"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>
          );
        })}
      </section>
    </ToastContext>
  );
}
