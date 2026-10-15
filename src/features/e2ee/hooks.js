import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import * as api from './api';
import { e2eeClient } from './e2ee-client';

/** This browser's encryption state: off, unavailable, starting, ready or failed. */
export function useE2eeState(client = e2eeClient) {
  return useSyncExternalStore(client.subscribe, client.getState);
}

/** Whether this server lets conversations be encrypted (fetched once per app session). */
export function useE2eeServerStatus(enabled = true) {
  return useQuery({
    queryKey: ['e2ee', 'status'],
    queryFn: api.serverStatus,
    staleTime: Number.POSITIVE_INFINITY,
    enabled,
  });
}

export const conversationE2eeKey = (conversationId) => ['e2ee', 'conversation', conversationId];

export function useConversationE2eeStatus(conversationId, enabled = true) {
  return useQuery({
    queryKey: conversationE2eeKey(conversationId),
    queryFn: () => api.conversationStatus(conversationId),
    enabled: enabled && Boolean(conversationId),
  });
}

const isEncrypted = (message) =>
  message.encryption === 'e2ee_v1' && !message.deletedAt && Boolean(message.encrypted);

/**
 * Decrypts the encrypted messages among `messages` (once each, in the background) and returns a
 * lookup for their results. Re-renders when results arrive.
 */
export function useDecryptedMessages(messages, client = e2eeClient) {
  const version = useSyncExternalStore(client.subscribe, client.getVersion);
  const status = useSyncExternalStore(client.subscribe, () => client.getState().status);
  useEffect(() => {
    if (status !== 'ready') return;
    for (const message of messages) if (isEncrypted(message)) client.request(message);
  }, [client, messages, status, version]);
  return useCallback(
    (message) => {
      if (!isEncrypted(message)) return undefined;
      return (
        client.resultFor(message) ?? {
          status: status === 'ready' || status === 'starting' ? 'pending' : 'unavailable',
        }
      );
    },
    // `version` changes whenever a result arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, status, version],
  );
}

export const peerDevicesKey = (userId) => ['e2ee', 'devices', userId];

/** The other person's devices and whether this device verified them (null until known). */
export function usePeerDevices(userId, enabled) {
  return useQuery({
    queryKey: peerDevicesKey(userId),
    queryFn: () => e2eeClient.devices(userId),
    enabled: enabled && Boolean(userId),
    staleTime: 30_000,
  });
}
