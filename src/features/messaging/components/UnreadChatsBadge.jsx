import { CountBadge } from '../../../components/ui/Badge';
import { useUnreadTotal } from '../hooks';

/** Unread messages across your conversations, shown on the Chats navigation item. */
export function UnreadChatsBadge() {
  const count = useUnreadTotal();
  return <CountBadge count={count} label={`${count} unread messages`} />;
}
