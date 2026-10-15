import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useSession } from '../../auth/hooks';
import { notificationsKey } from '../cache';
import { useNotificationPreferences } from '../hooks';
import { startNotificationsClient } from '../notifications-client';

/**
 * Keeps notifications live while the signed-in shell is shown (renders nothing). Preferences are
 * loaded up front so desktop alerts know whether they're wanted.
 */
export function NotificationsRealtime() {
  const session = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  const userId = session.user?.id ?? null;
  useNotificationPreferences();

  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  useEffect(() => {
    if (!userId) return undefined;
    const stop = startNotificationsClient(queryClient, {
      onOpen: (notification) => void navigateRef.current(notification.link),
    });
    return () => {
      stop();
      // Never show one account's notifications to the next person signing in on this tab.
      queryClient.removeQueries({ queryKey: notificationsKey });
    };
  }, [queryClient, userId]);

  return null;
}
