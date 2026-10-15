import {
  Bell,
  CircleUserRound,
  Compass,
  Inbox,
  MessageCircle,
  Settings,
  Users,
} from 'lucide-react';

/** Primary destinations: sidebar on tablet/desktop, bottom tab bar on mobile. */
export const primaryNavItems = [
  // `badge`: shows a count next to the item (see NavBadge).
  { to: '/chats', label: 'Chats', icon: MessageCircle, badge: 'unread-chats' },
  { to: '/discover', label: 'Discover', icon: Compass },
  { to: '/requests', label: 'Requests', icon: Inbox },
  { to: '/groups', label: 'Groups', icon: Users },
  { to: '/notifications', label: 'Notifications', icon: Bell, badge: 'notifications' },
];

/** Account destinations: sidebar footer on tablet/desktop, user menu on mobile. */
export const accountNavItems = [
  { to: '/profile', label: 'Profile', icon: CircleUserRound },
  { to: '/settings', label: 'Settings', icon: Settings },
];
