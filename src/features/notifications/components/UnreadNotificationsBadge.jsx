import { CountBadge } from '../../../components/ui/Badge';
import { useUnreadNotificationCount } from '../hooks';

/** Unread notifications, shown on the Notifications navigation item and the bell. */
export function UnreadNotificationsBadge() {
  const count = useUnreadNotificationCount().data ?? 0;
  return <CountBadge count={count} label={`${count} unread notifications`} />;
}
