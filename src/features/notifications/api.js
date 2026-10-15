import {
  notificationPreferencesSchema,
  notificationSchema,
  notificationUnreadCountSchema,
} from '#shared';
import { z } from 'zod';
import { apiClient, unwrap, unwrapPage } from '../../lib/api-client';

/** HTTP calls for your own notifications and notification preferences. */

const notificationPath = (id) => `/notifications/${encodeURIComponent(id)}`;

/** @param {{ cursor?: string | null, filter?: 'all' | 'unread' }} [query] */
export async function listNotifications({ cursor, filter } = {}) {
  return unwrapPage(
    notificationSchema,
    await apiClient.get('/notifications', {
      params: {
        ...(cursor ? { cursor } : {}),
        ...(filter && filter !== 'all' ? { filter } : {}),
      },
    }),
  );
}

export async function getUnreadCount() {
  return unwrap(notificationUnreadCountSchema, await apiClient.get('/notifications/unread-count'))
    .unread;
}

export async function markNotificationRead(id) {
  return unwrap(
    z.object({ notification: notificationSchema, unread: z.number().int().min(0) }),
    await apiClient.post(`${notificationPath(id)}/read`),
  );
}

export async function markAllNotificationsRead() {
  return unwrap(
    z.object({ unread: z.number().int().min(0), before: z.string() }),
    await apiClient.post('/notifications/read-all'),
  );
}

export async function dismissNotification(id) {
  await apiClient.delete(notificationPath(id));
}

export async function getNotificationPreferences() {
  return unwrap(notificationPreferencesSchema, await apiClient.get('/notifications/preferences'));
}

/** Send only what changes. */
export async function updateNotificationPreferences(changes) {
  return unwrap(
    notificationPreferencesSchema,
    await apiClient.patch('/notifications/preferences', changes),
  );
}
