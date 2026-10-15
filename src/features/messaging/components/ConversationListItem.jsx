import {
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  EllipsisVertical,
  Heart,
  HeartOff,
  MailCheck,
  MailWarning,
  Pin,
  PinOff,
  Trash2,
} from 'lucide-react';
import { NavLink } from 'react-router';
import { Avatar } from '../../../components/ui/Avatar';
import { CountBadge } from '../../../components/ui/Badge';
import { DropdownMenu } from '../../../components/ui/DropdownMenu';
import { cn } from '../../../lib/cn';
import { formatListTimestamp } from '../../../lib/format-time';

/** Your own chat settings for this row; the server applies (and checks) each one. */
function menuItems(conversation, onAction) {
  const { pinned, favorite, archived, muted, markedUnread, unreadCount } = conversation;
  const items = [
    pinned
      ? { label: 'Unpin chat', icon: PinOff, onSelect: () => onAction({ pinned: false }) }
      : { label: 'Pin chat', icon: Pin, onSelect: () => onAction({ pinned: true }) },
    favorite
      ? {
          label: 'Remove from favorites',
          icon: HeartOff,
          onSelect: () => onAction({ favorite: false }),
        }
      : { label: 'Add to favorites', icon: Heart, onSelect: () => onAction({ favorite: true }) },
    archived
      ? { label: 'Unarchive', icon: ArchiveRestore, onSelect: () => onAction({ archived: false }) }
      : { label: 'Archive', icon: Archive, onSelect: () => onAction({ archived: true }) },
  ];
  if (muted) {
    items.push({ label: 'Unmute', icon: Bell, onSelect: () => onAction({ muted: 'off' }) });
  } else {
    items.push(
      { label: 'Mute for 8 hours', icon: BellOff, onSelect: () => onAction({ muted: '8h' }) },
      { label: 'Mute for 1 week', icon: BellOff, onSelect: () => onAction({ muted: '1w' }) },
      { label: 'Mute until unmuted', icon: BellOff, onSelect: () => onAction({ muted: 'always' }) },
    );
  }
  items.push(
    markedUnread || unreadCount > 0
      ? markedUnread
        ? {
            label: 'Mark as read',
            icon: MailCheck,
            onSelect: () => onAction({ markedUnread: false }),
          }
        : null
      : {
          label: 'Mark as unread',
          icon: MailWarning,
          onSelect: () => onAction({ markedUnread: true }),
        },
    { type: 'separator' },
    {
      label: 'Remove from list…',
      icon: Trash2,
      tone: 'danger',
      onSelect: () => onAction('remove'),
    },
  );
  return items.filter(Boolean);
}

/**
 * One row of the chat list. `onAction` (optional) receives a preferences change, or "remove";
 * the menu sits next to the link so keyboard and screen-reader users reach both.
 */
export function ConversationListItem({ conversation, onAction }) {
  const { id, title, avatarUrl, presence, lastMessage, unreadCount, typing } = conversation;
  const unread = unreadCount > 0 || conversation.markedUnread;
  return (
    <div className="group relative">
      <NavLink
        to={`/chats/${id}`}
        className={({ isActive }) =>
          cn(
            'flex items-center gap-3 rounded-xl px-3 py-2.5',
            onAction && 'pr-11',
            isActive ? 'bg-primary-50' : 'hover:bg-surface-muted',
          )
        }
      >
        <Avatar name={title} src={avatarUrl} presence={presence} decorative />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1">
              <span
                className={cn(
                  'truncate text-sm text-ink',
                  unread ? 'font-semibold' : 'font-medium',
                )}
              >
                {title}
              </span>
              {conversation.favorite ? (
                <Heart
                  aria-label="Favorite"
                  className="size-3.5 shrink-0 fill-primary-500 text-primary-500"
                />
              ) : null}
            </span>
            {lastMessage ? (
              <time
                dateTime={lastMessage.sentAt}
                className={cn(
                  'shrink-0 text-xs',
                  unread ? 'font-medium text-primary-700' : 'text-ink-muted',
                )}
              >
                {formatListTimestamp(lastMessage.sentAt)}
              </time>
            ) : null}
          </span>
          <span className="mt-0.5 flex items-center justify-between gap-2">
            <span
              className={cn(
                'truncate text-sm',
                typing ? 'text-primary-700' : unread ? 'text-ink' : 'text-ink-muted',
              )}
            >
              {typing
                ? 'typing…'
                : lastMessage
                  ? `${lastMessage.fromSelf ? 'You: ' : ''}${lastMessage.preview}`
                  : 'No messages yet'}
            </span>
            <span className="flex shrink-0 items-center gap-1 text-ink-subtle">
              {conversation.muted ? <BellOff aria-label="Muted" className="size-3.5" /> : null}
              {conversation.pinned ? <Pin aria-label="Pinned" className="size-3.5" /> : null}
              {unreadCount > 0 ? (
                <CountBadge count={unreadCount} label={`${unreadCount} unread messages`} />
              ) : conversation.markedUnread ? (
                <span className="size-2.5 rounded-full bg-primary-600">
                  <span className="sr-only">Marked as unread</span>
                </span>
              ) : null}
            </span>
          </span>
        </span>
      </NavLink>
      {onAction ? (
        <div className="absolute inset-y-0 right-1.5 flex items-center">
          <DropdownMenu
            strategy="fixed"
            label={`Chat options for ${title}`}
            triggerClassName="inline-flex size-8 items-center justify-center rounded-full text-ink-muted hover:bg-surface hover:text-ink aria-expanded:bg-surface aria-expanded:text-ink"
            trigger={<EllipsisVertical aria-hidden="true" className="size-4" />}
            items={menuItems(conversation, onAction)}
          />
        </div>
      ) : null}
    </div>
  );
}
