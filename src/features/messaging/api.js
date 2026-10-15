import {
  attachmentSchema,
  conversationSchema,
  messageSchema,
  messageStateSchema,
  pinnedMessageSchema,
  sentMessageSchema,
} from '#shared';
import { z } from 'zod';
import { apiClient, unwrap, unwrapPage } from '../../lib/api-client';

/** HTTP calls for conversations, messages, message actions and attachments. */

const conversationPath = (id) => `/conversations/${encodeURIComponent(id)}`;
const messagePath = (conversationId, messageId) =>
  `${conversationPath(conversationId)}/messages/${encodeURIComponent(messageId)}`;

/** @param {{ cursor?: string | null, filter?: 'all' | 'unread' | 'favorites' | 'archived', q?: string }} [query] */
export async function listConversations({ cursor, filter, q } = {}) {
  return unwrapPage(
    conversationSchema,
    await apiClient.get('/conversations', {
      params: {
        ...(cursor ? { cursor } : {}),
        ...(filter && filter !== 'all' ? { filter } : {}),
        ...(q ? { q } : {}),
      },
    }),
  );
}

/**
 * Your own chat settings; send only what changes.
 *
 * @param {string} id
 * @param {{ pinned?: boolean, favorite?: boolean, archived?: boolean, markedUnread?: boolean, muted?: '8h' | '1w' | 'always' | 'off' }} changes
 */
export async function updatePreferences(id, changes) {
  return unwrap(
    conversationSchema,
    await apiClient.patch(`${conversationPath(id)}/preferences`, changes),
  );
}

/** Removes the conversation from your list only (nothing is deleted). */
export async function removeConversation(id) {
  await apiClient.delete(conversationPath(id));
}

export async function getConversation(id) {
  return unwrap(conversationSchema, await apiClient.get(conversationPath(id)));
}

/** Opens (or creates) the conversation with a person. */
export async function openConversation(userId) {
  return unwrap(conversationSchema, await apiClient.post('/conversations', { userId }));
}

/**
 * A page of history, oldest first. `cursor` (meta.nextCursor of the previous page) goes further
 * back; `after` returns messages after a seq.
 *
 * @param {string} conversationId
 * @param {{ cursor?: string | null, after?: number, limit?: number }} [query]
 */
export async function listMessages(conversationId, { cursor, after, limit } = {}) {
  return unwrapPage(
    messageSchema,
    await apiClient.get(`${conversationPath(conversationId)}/messages`, {
      params: {
        ...(cursor ? { cursor } : {}),
        ...(after !== undefined ? { after } : {}),
        ...(limit ? { limit } : {}),
      },
    }),
  );
}

/**
 * HTTP fallback for message:send. Safe to retry with the same clientMessageId.
 *
 * @param {string} conversationId
 * @param {{ clientMessageId: string, text?: string, attachmentId?: string, sticker?: string, replyToId?: string, forwardOfId?: string }} message
 */
export async function sendMessage(conversationId, message) {
  return unwrap(
    sentMessageSchema,
    await apiClient.post(`${conversationPath(conversationId)}/messages`, message),
  );
}

/** `change`: the new text, or `{ encrypted }` for an end-to-end encrypted message. */
export async function editMessage(conversationId, messageId, change) {
  const body = typeof change === 'string' ? { text: change } : change;
  return unwrap(messageSchema, await apiClient.patch(messagePath(conversationId, messageId), body));
}

/** @param {'me' | 'everyone'} scope */
export async function deleteMessage(conversationId, messageId, scope) {
  return unwrap(
    z.object({ message: messageSchema.optional(), state: messageStateSchema.optional() }),
    await apiClient.delete(messagePath(conversationId, messageId), { params: { scope } }),
  );
}

export async function react(conversationId, messageId, emoji) {
  return unwrap(
    messageSchema,
    await apiClient.put(`${messagePath(conversationId, messageId)}/reaction`, { emoji }),
  );
}

export async function unreact(conversationId, messageId) {
  return unwrap(
    messageSchema,
    await apiClient.delete(`${messagePath(conversationId, messageId)}/reaction`),
  );
}

export async function setPinned(conversationId, messageId, pinned) {
  const url = `${messagePath(conversationId, messageId)}/pin`;
  return unwrap(
    z.array(pinnedMessageSchema),
    await (pinned ? apiClient.put(url) : apiClient.delete(url)),
  );
}

export async function setStarred(conversationId, messageId, starred) {
  const url = `${messagePath(conversationId, messageId)}/star`;
  return unwrap(messageStateSchema, await (starred ? apiClient.put(url) : apiClient.delete(url)));
}

export async function listStarred(conversationId) {
  return unwrap(
    z.array(messageSchema),
    await apiClient.get(`${conversationPath(conversationId)}/starred`),
  );
}

/**
 * Uploads one file (≤ 5 MB) for a later message. Reports progress (0–1) and can be cancelled
 * with `signal`.
 *
 * @param {string} conversationId
 * @param {File} file
 * @param {{ kind?: 'voice', onProgress?: (fraction: number) => void, signal?: AbortSignal }} [options]
 */
export async function uploadAttachment(conversationId, file, { kind, onProgress, signal } = {}) {
  const form = new FormData();
  if (kind) form.append('kind', kind);
  form.append('file', file, file.name);
  return unwrap(
    attachmentSchema,
    await apiClient.post(`${conversationPath(conversationId)}/attachments`, form, {
      signal,
      timeout: 120_000,
      onUploadProgress: (event) => {
        if (event.total) onProgress?.(event.loaded / event.total);
      },
    }),
  );
}
