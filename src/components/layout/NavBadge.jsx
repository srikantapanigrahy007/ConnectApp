import { UnreadChatsBadge } from '../../features/messaging/components/UnreadChatsBadge';
import { UnreadNotificationsBadge } from '../../features/notifications/components/UnreadNotificationsBadge';

/** The count shown next to a navigation item (see `badge` in nav-items.js). */
export function NavBadge({ kind }) {
  if (kind === 'unread-chats') return <UnreadChatsBadge />;
  if (kind === 'notifications') return <UnreadNotificationsBadge />;
  return null;
}
