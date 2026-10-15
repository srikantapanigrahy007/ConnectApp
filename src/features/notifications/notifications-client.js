import { NOTIFICATION_SOCKET_EVENTS as EVENTS, notificationSchema } from '#shared';
import { onRealtimeSocket } from '../../lib/realtime-socket';
import {
  markNotificationsRead,
  notificationPreferencesKey,
  notificationsKey,
  removeNotifications,
  upsertNotification,
} from './cache';
import { showDesktopAlert } from './desktop';

/**
 * Connects notifications to the app's authenticated socket: live entries, read state from
 * other tabs and devices, removals and preference changes. After every (re)connection the list,
 * count and preferences are fetched again, because events sent while offline are not replayed.
 *
 * @param {import('@tanstack/react-query').QueryClient} queryClient
 * @param {{ onOpen?: (notification: object) => void }} [options] Opens a notification's link
 *   (used when a desktop alert is clicked).
 * @returns {() => void} Stops listening.
 */
export function startNotificationsClient(queryClient, { onOpen } = {}) {
  const handlers = {
    connect: () => {
      void queryClient.invalidateQueries({ queryKey: notificationsKey });
    },
    [EVENTS.upsert]: ({ notification, unreadCount } = {}) => {
      const parsed = notificationSchema.safeParse(notification);
      if (!parsed.success) return;
      upsertNotification(queryClient, parsed.data, unreadCount);
      const preferences = queryClient.getQueryData(notificationPreferencesKey);
      showDesktopAlert(parsed.data, { enabled: Boolean(preferences?.desktop), onOpen });
    },
    [EVENTS.read]: ({ ids = null, before, unreadCount } = {}) => {
      markNotificationsRead(queryClient, { ids, before, unreadCount });
    },
    [EVENTS.removed]: ({ ids = [], unreadCount } = {}) => {
      removeNotifications(queryClient, { ids, unreadCount });
    },
    [EVENTS.preferences]: ({ preferences } = {}) => {
      if (preferences) queryClient.setQueryData(notificationPreferencesKey, preferences);
    },
  };

  let attached = null;
  const detach = () => {
    if (!attached) return;
    for (const [event, handler] of Object.entries(handlers)) attached.off?.(event, handler);
    attached = null;
  };
  const stopListening = onRealtimeSocket((socket) => {
    detach();
    if (!socket) return;
    attached = socket;
    for (const [event, handler] of Object.entries(handlers)) socket.on(event, handler);
  });
  return () => {
    stopListening();
    detach();
  };
}
