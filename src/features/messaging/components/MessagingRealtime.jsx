import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useSession } from '../../auth/hooks';
import { startMessagingClient } from '../messaging-client';
import { resetMessagingStore } from '../store';

/**
 * Connects messaging to the app's authenticated socket while the signed-in shell is shown, so
 * unread counts, receipts and presence stay current on every screen. Renders nothing.
 */
export function MessagingRealtime() {
  const session = useSession();
  const queryClient = useQueryClient();
  const userId = session.user?.id ?? null;

  useEffect(() => {
    resetMessagingStore(userId);
    if (!userId) return undefined;
    const stop = startMessagingClient(queryClient);
    return () => {
      stop();
      resetMessagingStore(null);
    };
  }, [queryClient, userId]);

  return null;
}
