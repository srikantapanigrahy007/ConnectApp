import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../auth/hooks';
import * as api from './api';
import {
  markNotificationsRead,
  notificationListKey,
  notificationPreferencesKey,
  removeNotifications,
  unreadCountKey,
} from './cache';

/** @param {'all' | 'unread'} filter */
export function useNotifications(filter = 'all', { enabled = true } = {}) {
  return useInfiniteQuery({
    queryKey: notificationListKey(filter),
    queryFn: ({ pageParam }) => api.listNotifications({ filter, cursor: pageParam }),
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.meta.nextCursor,
    enabled,
  });
}

/** Unread notifications (kept current by live events; refetched after reconnecting). */
export function useUnreadNotificationCount() {
  const session = useSession();
  return useQuery({
    queryKey: unreadCountKey,
    queryFn: () => api.getUnreadCount(),
    enabled: session.status === 'authenticated',
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.markNotificationRead(id),
    onSuccess: ({ notification, unread }) =>
      markNotificationsRead(queryClient, { ids: [notification.id], unreadCount: unread }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.markAllNotificationsRead(),
    onSuccess: ({ unread, before }) =>
      markNotificationsRead(queryClient, { ids: null, before, unreadCount: unread }),
  });
}

export function useDismissNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.dismissNotification(id),
    onSuccess: (_data, id) => {
      removeNotifications(queryClient, { ids: [id] });
      void queryClient.invalidateQueries({ queryKey: unreadCountKey });
    },
  });
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: notificationPreferencesKey,
    queryFn: () => api.getNotificationPreferences(),
  });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (changes) => api.updateNotificationPreferences(changes),
    onSuccess: (preferences) => queryClient.setQueryData(notificationPreferencesKey, preferences),
  });
}
