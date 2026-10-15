import { Bell, CheckCheck } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../../components/ui/Button';
import { buttonClasses } from '../../../components/ui/button-styles';
import { cn } from '../../../lib/cn';
import { useMarkAllNotificationsRead, useUnreadNotificationCount } from '../hooks';
import { NotificationList } from './NotificationList';
import { UnreadNotificationsBadge } from './UnreadNotificationsBadge';

const PANEL_LIMIT = 6;

/**
 * Bell with the unread count; opens a panel with the latest notifications (non-modal dialog:
 * Escape or a click outside closes it and focus returns to the bell).
 */
export function NotificationBell({ align = 'start' }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const titleId = useId();
  const containerRef = useRef(null);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const count = useUnreadNotificationCount().data ?? 0;
  const markAll = useMarkAllNotificationsRead();

  const close = useCallback((restoreFocus) => {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    panelRef.current?.focus();
    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) close(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, close]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? close(false) : setOpen(true))}
        className={buttonClasses({ variant: 'ghost', size: 'md', iconOnly: true })}
      >
        <span className="relative">
          <Bell aria-hidden="true" className="size-5" />
          <span className="absolute -top-2 -right-2.5">
            <UnreadNotificationsBadge />
          </span>
        </span>
      </button>
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-labelledby={titleId}
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              close(true);
            }
          }}
          className={cn(
            'absolute top-full z-30 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-surface shadow-lg focus:outline-none',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h2 id={titleId} className="text-sm font-semibold text-ink">
              Notifications
            </h2>
            <Button
              variant="ghost"
              size="sm"
              icon={CheckCheck}
              disabled={count === 0}
              loading={markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              Mark all as read
            </Button>
          </div>
          <div className="max-h-[min(28rem,70dvh)] overflow-y-auto py-1">
            <NotificationList limit={PANEL_LIMIT} onNavigate={() => close(false)} />
          </div>
          <div className="border-t border-border p-2">
            <Link
              to="/notifications"
              onClick={() => close(false)}
              className="block rounded-lg px-3 py-2 text-center text-sm font-medium text-primary-700 hover:bg-primary-50"
            >
              View all notifications
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
