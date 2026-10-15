import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { getConnectionState, onConnectionState } from '../../lib/realtime-socket';
import * as api from './api';
import {
  conversationKey,
  conversationListKey,
  conversationsKey,
  loadTimeline,
  receiveMissedMessages,
  setActiveConversation,
} from './messaging-client';
import { applyConversationSummaries, outboxOf, timelineOf, useMessagingStore } from './store';

export const isConversationId = (id) => typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id);

/**
 * The signed-in user's conversations, with "load more". `filter` is all | unread | favorites |
 * archived; `q` searches the other person's username or display name (on the server).
 */
export function useConversations(filter = 'all', q = '') {
  return useInfiniteQuery({
    queryKey: [...conversationListKey, filter, q],
    queryFn: async ({ pageParam }) => {
      const page = await api.listConversations({ cursor: pageParam, filter, q });
      applyConversationSummaries(page.items);
      receiveMissedMessages(page.items);
      return page;
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.meta.nextCursor,
    staleTime: 10_000,
  });
}

/**
 * Unread messages across the loaded pages of your main list (for the navigation badge). Muted
 * and archived chats don't count.
 */
export function useUnreadTotal() {
  const conversations = useConversations();
  return (conversations.data?.pages ?? [])
    .flatMap((page) => page.items)
    .filter((conversation) => !conversation.preferences?.mutedUntil)
    .reduce((total, conversation) => total + conversation.unreadCount, 0);
}

export function useConversation(conversationId) {
  return useQuery({
    queryKey: conversationKey(conversationId),
    queryFn: async () => {
      const conversation = await api.getConversation(conversationId);
      applyConversationSummaries([conversation]);
      return conversation;
    },
    enabled: isConversationId(conversationId),
    retry: false,
  });
}

/** Opens (or creates) the conversation with a person; resolves with the conversation. */
export function useOpenConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId) => api.openConversation(userId),
    onSuccess: (conversation) => {
      applyConversationSummaries([conversation]);
      queryClient.setQueryData(conversationKey(conversation.id), conversation);
      void queryClient.invalidateQueries({ queryKey: conversationsKey });
    },
  });
}

/**
 * Loaded messages and unsent messages of a conversation, and marks it as the one on screen
 * (so incoming messages are reported as read while it stays visible).
 */
export function useConversationTimeline(conversationId) {
  const timeline = useMessagingStore((state) => timelineOf(conversationId, state));
  const outbox = useMessagingStore((state) => outboxOf(conversationId, state));

  useEffect(() => {
    if (!isConversationId(conversationId)) return undefined;
    void loadTimeline(conversationId);
    setActiveConversation(conversationId);
    return () => setActiveConversation(null);
  }, [conversationId]);

  return { timeline, outbox };
}

/** Your starred messages in a conversation (loaded when `enabled`, e.g. a dialog is open). */
export function useStarredMessages(conversationId, enabled) {
  return useQuery({
    queryKey: ['conversations', 'starred', conversationId],
    queryFn: () => api.listStarred(conversationId),
    enabled: enabled && isConversationId(conversationId),
    staleTime: 0,
  });
}

/** "offline" | "connecting" | "connected" | "reconnecting". */
export function useConnectionState() {
  return useSyncExternalStore(onConnectionState, getConnectionState, getConnectionState);
}
