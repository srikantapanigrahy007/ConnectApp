import { Check, X } from 'lucide-react';
import { Link } from 'react-router';
import { Avatar } from '../../../components/ui/Avatar';
import { IconButton } from '../../../components/ui/Button';
import { cn } from '../../../lib/cn';
import { formatListTimestamp } from '../../../lib/format-time';
import { describeNotification } from '../describe';

/**
 * One notification. Its text links to what it's about when that's still yours to open; opening
 * it marks it read. "Mark as read" and "Dismiss" are separate buttons (never nested in the link).
 */
export function NotificationItem({ notification, onOpen, onMarkRead, onDismiss, compact = false }) {
  const { icon: Icon, text } = describeNotification(notification);
  const unread = !notification.read;

  const body = (
    <>
      <span className="relative shrink-0">
        {notification.actor ? (
          <Avatar
            name={notification.actor.displayName}
            src={notification.actor.avatarUrl}
            size={compact ? 'sm' : 'md'}
            decorative
          />
        ) : (
          <span
            className={cn(
              'flex items-center justify-center rounded-full bg-primary-100 text-primary-700',
              compact ? 'size-8' : 'size-10',
            )}
          >
            <Icon aria-hidden="true" className="size-4" />
          </span>
        )}
        {notification.actor ? (
          <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-primary-600 text-white ring-2 ring-surface">
            <Icon aria-hidden="true" className="size-3" />
          </span>
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block text-sm', unread ? 'font-medium text-ink' : 'text-ink-muted')}>
          {unread ? <span className="sr-only">Unread: </span> : null}
          {text}
        </span>
        {notification.available ? null : (
          <span className="mt-0.5 block text-xs text-ink-muted">No longer available</span>
        )}
        <time dateTime={notification.createdAt} className="mt-0.5 block text-xs text-ink-muted">
          {formatListTimestamp(notification.createdAt)}
        </time>
      </span>
    </>
  );

  const bodyClass = 'flex min-w-0 flex-1 items-start gap-3 rounded-lg p-2 text-left';

  return (
    <li className={cn('flex items-start gap-1 px-2 py-1', unread && 'bg-primary-50/60')}>
      {notification.link ? (
        <Link
          to={notification.link}
          onClick={() => onOpen?.(notification)}
          className={cn(
            bodyClass,
            'hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary-500',
          )}
        >
          {body}
        </Link>
      ) : (
        <div className={bodyClass}>{body}</div>
      )}
      <div className="flex shrink-0 items-center gap-0.5 pt-2">
        {unread ? (
          <IconButton
            size="sm"
            icon={Check}
            label="Mark as read"
            onClick={() => onMarkRead?.(notification)}
          />
        ) : null}
        {onDismiss ? (
          <IconButton
            size="sm"
            icon={X}
            label="Dismiss notification"
            onClick={() => onDismiss(notification)}
          />
        ) : null}
      </div>
    </li>
  );
}
