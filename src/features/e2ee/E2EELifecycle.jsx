import { useEffect } from 'react';
import { useSession } from '../auth/hooks';
import { cryptoRuntime } from './crypto-runtime';
import { e2eeClient } from './e2ee-client';

/**
 * Follows the signed-in account: starts end-to-end encryption on this browser only if it was set
 * up here before (opt-in; otherwise nothing loads), and closes the device whenever the account
 * changes or signs out, so one account's device is never used for another. Renders nothing.
 */
export function E2EELifecycle({ runtime = cryptoRuntime, client = e2eeClient }) {
  const userId = useSession().user?.id ?? null;
  useEffect(() => {
    if (userId) void client.start(userId);
    return () => {
      client.stop();
      void runtime.close();
    };
  }, [client, runtime, userId]);
  return null;
}
