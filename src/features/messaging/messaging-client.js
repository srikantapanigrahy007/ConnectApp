import { MESSAGING_SOCKET_EVENTS as EVENTS } from '#shared';
import { toApiError } from '../../lib/api-client';
import { getRealtimeSocket, onRealtimeSocket } from '../../lib/realtime-socket';
import { E2eeError, e2eeClient } from '../e2ee/e2ee-client';
import * as groupsApi from '../groups/api';
import * as api from './api';
import {
  addToOutbox,
  allOutboxEntries,
  applyConversationSummaries,
  applyMessageState,
  applyPoll,
  contiguousSeq,
  getMessagingState,
  mergeMessages,
  outboxOf,
  receiptsOf,
  removeFromOutbox,
  setPresence,
  setTyping,
  timelineOf,
  updateOutboxEntry,
  updateReceipts,
  updateTimeline,
} from './store';

/**
 * Messaging actions and real-time event handling for the web app.
 *
 * Sending: every message gets a client message id (idempotency key) and goes into the outbox
 * as "sending". It only becomes "sent" when the server acknowledges that it is stored
 * (message:send acknowledgment, or the HTTP fallback). A failure marks it "failed"; retrying
 * reuses the same id, so the server never stores it twice. Attachments are uploaded first
 * (with progress and cancel); the message is sent only once the server confirmed the upload,
 * and a retry after a failed send reuses the uploaded file instead of uploading it again.
 *
 * Actions (edit, delete, react, pin, star) go over HTTP; the server pushes the result to every
 * tab of both people (message:updated, conversation:pins) or of the actor only (message:state).
 *
 * Receiving: the server pushes message:created. A message that continues the known sequence is
 * added directly; anything else triggers conversation:sync from the last known seq. After
 * messages arrive the device reports delivery, and an open, visible conversation reports
 * reading. On every (re)connection, loaded conversations are synchronised, the conversation list
 * is refreshed and unsent messages are retried.
 */

export const conversationsKey = ['conversations'];
export const conversationListKey = ['conversations', 'list'];
export const conversationKey = (id) => ['conversations', 'detail', id];

const ACK_TIMEOUT_MS = 10_000;
const HISTORY_PAGE_SIZE = 30;
const TYPING_REFRESH_MS = 3_000;
const TYPING_IDLE_MS = 4_000;
/** Failures worth retrying with the same id; anything else needs the user to decide. */
const RETRYABLE_CODES = new Set([
  'OFFLINE',
  'TIMEOUT',
  'NETWORK_ERROR',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
  'RATE_LIMITED',
  'UNKNOWN_ERROR',
]);
const AUTO_RETRY_LIMIT = 3;

export class MessagingError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MessagingError';
    this.code = code;
    this.retryable = RETRYABLE_CODES.has(code);
  }
}

function toMessagingError(error) {
  if (error instanceof MessagingError) return error;
  if (error instanceof E2eeError) return new MessagingError(error.code, error.message);
  const apiError = toApiError(error);
  return new MessagingError(apiError.code, apiError.message);
}

let queryClient = null;
let activeConversationId = null;

/** A random RFC 4122 v4 UUID (the message's idempotency key). */
export function newClientMessageId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Emits with a Socket.IO acknowledgment; rejects with a MessagingError (never hangs). */
export function emitWithAck(event, payload, timeoutMs = ACK_TIMEOUT_MS) {
  const socket = getRealtimeSocket();
  if (!socket?.connected) {
    return Promise.reject(new MessagingError('OFFLINE', "You're offline right now."));
  }
  return new Promise((resolve, reject) => {
    socket.timeout(timeoutMs).emit(event, payload, (error, response) => {
      if (error) {
        reject(new MessagingError('TIMEOUT', 'The server did not respond in time.'));
      } else if (response?.ok) {
        resolve(response.data);
      } else {
        reject(
          new MessagingError(
            response?.error?.code ?? 'UNKNOWN_ERROR',
            response?.error?.message ?? 'Something went wrong. Please try again.',
          ),
        );
      }
    });
  });
}

// ── Conversation summaries (TanStack Query) ─────────────────────────────────

let refreshTimer;
/** Re-fetches conversation summaries (order, previews, unread counts) shortly, once per burst. */
function refreshConversations(delayMs = 300) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    void queryClient?.invalidateQueries({ queryKey: conversationsKey });
  }, delayMs);
}

/** Applies `patch` to a conversation in every cached list (all filters) and its detail. */
function patchCachedConversation(conversationId, patch) {
  if (!queryClient) return;
  const apply = (item) => (item.id === conversationId ? { ...item, ...patch(item) } : item);
  queryClient.setQueriesData({ queryKey: conversationListKey }, (data) =>
    data?.pages
      ? { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.map(apply) })) }
      : data,
  );
  queryClient.setQueryData(conversationKey(conversationId), (data) => (data ? apply(data) : data));
}

function setCachedUnread(conversationId, unreadCount) {
  patchCachedConversation(conversationId, () => ({ unreadCount }));
}

function storeSummary(conversation) {
  applyConversationSummaries([conversation]);
  queryClient?.setQueryData(conversationKey(conversation.id), conversation);
}

function setCachedPins(conversationId, pins) {
  queryClient?.setQueryData(conversationKey(conversationId), (data) =>
    data ? { ...data, pins } : data,
  );
}

// ── History ─────────────────────────────────────────────────────────────────

/** Highest seq this device can vouch for having received without gaps. */
function knownSeq(conversationId) {
  const timeline = timelineOf(conversationId);
  const contiguous = contiguousSeq(timeline);
  return timeline.loaded
    ? contiguous
    : Math.max(contiguous, receiptsOf(conversationId).myDeliveredSeq);
}

/** Loads the newest page (first open) or catches up (later opens). */
export async function loadTimeline(conversationId) {
  const timeline = timelineOf(conversationId);
  if (timeline.loaded) {
    await syncConversation(conversationId);
    return;
  }
  if (timeline.status === 'loading') return;
  updateTimeline(conversationId, { status: 'loading', error: null });
  try {
    const page = await api.listMessages(conversationId, { limit: HISTORY_PAGE_SIZE });
    const oldest = page.items[0]?.seq ?? Number.POSITIVE_INFINITY;
    // Keep live messages that arrived meanwhile; drop older fragments outside this page so the
    // timeline has no holes (older pages are loaded by cursor).
    const kept = timelineOf(conversationId).messages.filter((message) => message.seq >= oldest);
    updateTimeline(conversationId, { messages: kept });
    mergeMessages(conversationId, page.items, {
      loaded: true,
      status: 'ready',
      hasOlder: page.meta.hasMore,
      olderCursor: page.meta.nextCursor,
    });
    await syncConversation(conversationId);
  } catch (error) {
    updateTimeline(conversationId, { status: 'error', error: toApiError(error) });
  }
}

export async function loadOlderMessages(conversationId) {
  const timeline = timelineOf(conversationId);
  if (!timeline.hasOlder || timeline.olderStatus === 'loading' || !timeline.olderCursor) return;
  updateTimeline(conversationId, { olderStatus: 'loading' });
  try {
    const page = await api.listMessages(conversationId, {
      cursor: timeline.olderCursor,
      limit: HISTORY_PAGE_SIZE,
    });
    mergeMessages(conversationId, page.items, {
      hasOlder: page.meta.hasMore,
      olderCursor: page.meta.nextCursor,
      olderStatus: 'idle',
    });
  } catch {
    updateTimeline(conversationId, { olderStatus: 'error' });
  }
}

// ── Synchronisation and receipts ────────────────────────────────────────────

const syncing = new Map();
const syncAgain = new Set();

/**
 * Fetches everything after the last known seq (repeating while the server says there is more),
 * then reports delivery. Single-flight per conversation; a request made while one is running
 * runs once more afterwards, so a message stored mid-sync is never missed. Safe to repeat.
 */
export function syncConversation(conversationId) {
  if (syncing.has(conversationId)) {
    syncAgain.add(conversationId);
    return syncing.get(conversationId);
  }
  const run = (async () => {
    do {
      syncAgain.delete(conversationId);
      for (;;) {
        const timeline = timelineOf(conversationId);
        const data = await emitWithAck(EVENTS.sync, {
          conversationId,
          afterSeq: knownSeq(conversationId),
          // Edits, deletions and reactions to messages we already have.
          ...(timeline.loaded && timeline.changesSince
            ? { changesSince: timeline.changesSince }
            : {}),
        });
        storeSummary(data.conversation);
        mergeMessages(conversationId, [...data.messages, ...(data.changes ?? [])]);
        if (timeline.loaded) updateTimeline(conversationId, { changesSince: data.serverTime });
        if (!data.hasMore || data.messages.length === 0) break;
      }
    } while (syncAgain.has(conversationId));
    await acknowledge(conversationId);
  })()
    .catch(() => undefined)
    .finally(() => {
      syncing.delete(conversationId);
    });
  syncing.set(conversationId, run);
  return run;
}

async function reportDelivered(conversationId, seq) {
  if (seq <= receiptsOf(conversationId).myDeliveredSeq) return;
  const data = await emitWithAck(EVENTS.delivered, { conversationId, seq });
  updateReceipts(conversationId, { myDeliveredSeq: data.lastDeliveredSeq });
}

/** Reports delivery up to the known seq, then reading if the conversation is on screen. */
async function acknowledge(conversationId) {
  try {
    await reportDelivered(conversationId, knownSeq(conversationId));
    if (isViewing(conversationId)) await markConversationRead(conversationId);
  } catch {
    // Receipts are retried on the next message, sync or reconnection.
  }
}

function isViewing(conversationId) {
  return (
    activeConversationId === conversationId &&
    (typeof document === 'undefined' || document.visibilityState === 'visible')
  );
}

/** Marks everything loaded in an open conversation as read (after reporting its delivery). */
export async function markConversationRead(conversationId) {
  const timeline = timelineOf(conversationId);
  if (!timeline.loaded) return;
  const upTo = contiguousSeq(timeline);
  if (upTo <= receiptsOf(conversationId).myReadSeq) return;
  try {
    await reportDelivered(conversationId, upTo);
    const data = await emitWithAck(EVENTS.read, { conversationId, seq: upTo });
    updateReceipts(conversationId, { myReadSeq: data.lastReadSeq });
    setCachedUnread(conversationId, data.unreadCount);
  } catch {
    // Retried when the conversation is viewed again or new messages arrive.
  }
}

/**
 * After fetching conversation summaries: downloads (and so reports as delivered) messages from
 * the other person that this device has not received yet, e.g. after being offline.
 */
export function receiveMissedMessages(conversations) {
  if (!getRealtimeSocket()?.connected) return;
  const { selfId } = getMessagingState();
  for (const conversation of conversations) {
    const last = conversation.lastMessage;
    if (last && last.senderId !== selfId && last.seq > conversation.receipts.lastDeliveredSeq) {
      void syncConversation(conversation.id);
    }
  }
}

/** The conversation currently on screen (null when none). */
export function setActiveConversation(conversationId) {
  activeConversationId = conversationId;
  if (conversationId) void markConversationRead(conversationId);
}

// ── End-to-end encrypted chats ──────────────────────────────────────────────

/** The conversation summary (cached, or fetched once), to know whether it is encrypted. */
function cachedConversation(conversationId) {
  return (
    queryClient?.getQueryData(conversationKey(conversationId)) ??
    queryClient
      ?.getQueriesData({ queryKey: conversationListKey })
      .flatMap(([, data]) => data?.pages?.flatMap((page) => page.items) ?? [])
      .find((item) => item.id === conversationId)
  );
}

async function conversationFor(conversationId) {
  const cached = cachedConversation(conversationId);
  if (cached) return cached;
  // Unknown here: ask the server (if that fails, the send fails; it never goes out unencrypted).
  const conversation = await api.getConversation(conversationId);
  queryClient?.setQueryData(conversationKey(conversationId), conversation);
  return conversation;
}

/** What your own sent messages said (in memory), so they show without decrypting them again. */
const sentContent = new Map();
/**
 * The encrypted payload of an outgoing message in an end-to-end encrypted chat. Encrypted once
 * and kept with the outbox entry, so a retry re-sends exactly the same ciphertext (the server's
 * idempotency compares it). Never falls back to readable content.
 */
async function encryptedPayload(conversation, clientMessageId, content) {
  const entry = findEntry(conversation.id, clientMessageId);
  const reply = content.replyToId ? { replyToId: content.replyToId } : {};
  if (content.sticker || content.forwardOfId || content.poll) {
    throw new MessagingError(
      'E2EE_UNSUPPORTED',
      "This can't be sent in an end-to-end encrypted chat yet.",
    );
  }
  // Media is not end-to-end encrypted (product decision): the file goes as before, never with
  // readable text (sendMessage sends a caption as its own encrypted message).
  if (content.attachmentId)
    return { clientMessageId, attachmentId: content.attachmentId, ...reply };
  if (entry?.encrypted) return { clientMessageId, encrypted: entry.encrypted, ...reply };
  const inner = {
    msgtype: 'm.text',
    body: content.text ?? '',
    'connect.message': { clientMessageId },
  };
  const encrypted = await e2eeClient.encrypt(conversation, inner);
  sentContent.set(clientMessageId, inner);
  updateOutboxEntry(conversation.id, clientMessageId, { encrypted });
  return { clientMessageId, encrypted, ...reply };
}

// ── Sending ─────────────────────────────────────────────────────────────────

const inFlight = new Set();
/** Upload cancellation per pending message. */
const uploads = new Map();

const findEntry = (conversationId, clientMessageId) =>
  outboxOf(conversationId).find((item) => item.clientMessageId === clientMessageId);

/** Uploads the entry's file if it has not been uploaded yet; returns the content to send. */
async function ensureUploaded(conversationId, clientMessageId) {
  const entry = findEntry(conversationId, clientMessageId);
  const content = entry.content ?? { text: entry.text };
  if (!entry.upload || content.attachmentId) return content;
  if (!entry.upload.file) {
    throw new MessagingError('UPLOAD_LOST', 'The file is no longer available. Attach it again.');
  }
  const controller = new AbortController();
  uploads.set(clientMessageId, controller);
  let shown = 0;
  updateOutboxEntry(conversationId, clientMessageId, {
    upload: { ...entry.upload, status: 'uploading', progress: 0 },
  });
  try {
    const attachment = await api.uploadAttachment(conversationId, entry.upload.file, {
      kind: entry.upload.kind,
      signal: controller.signal,
      onProgress: (fraction) => {
        // Re-render at most every 5%.
        if (fraction - shown < 0.05 && fraction < 1) return;
        shown = fraction;
        const current = findEntry(conversationId, clientMessageId);
        if (current?.upload) {
          updateOutboxEntry(conversationId, clientMessageId, {
            upload: { ...current.upload, progress: fraction },
          });
        }
      },
    });
    const next = { ...content, attachmentId: attachment.id };
    const current = findEntry(conversationId, clientMessageId);
    updateOutboxEntry(conversationId, clientMessageId, {
      content: next,
      upload: { ...current.upload, status: 'done', progress: 1 },
    });
    return next;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new MessagingError('CANCELLED', 'Upload cancelled.');
    }
    const current = findEntry(conversationId, clientMessageId);
    if (current?.upload) {
      updateOutboxEntry(conversationId, clientMessageId, {
        upload: { ...current.upload, status: 'failed' },
      });
    }
    throw error;
  } finally {
    uploads.delete(clientMessageId);
  }
}

async function deliverOutgoing(conversationId, clientMessageId) {
  const entry = findEntry(conversationId, clientMessageId);
  if (!entry || inFlight.has(clientMessageId)) return;
  inFlight.add(clientMessageId);
  updateOutboxEntry(conversationId, clientMessageId, {
    status: 'sending',
    error: null,
    attempts: (entry.attempts ?? 0) + 1,
  });
  try {
    const content = await ensureUploaded(conversationId, clientMessageId);
    const conversation = await conversationFor(conversationId);
    const payload = conversation.e2ee
      ? await encryptedPayload(conversation, clientMessageId, content)
      : { clientMessageId, ...content };
    let result;
    try {
      result = await emitWithAck(EVENTS.send, { conversationId, ...payload });
    } catch (error) {
      // No live connection: the HTTP endpoint stores it the same way (same idempotency key).
      if (!(error instanceof MessagingError) || error.code !== 'OFFLINE') throw error;
      result = await api.sendMessage(conversationId, payload);
    }
    settleOwnMessage(result.message);
    refreshConversations();
    if (entry.pendingCaption) void sendMessage(conversationId, { text: entry.pendingCaption });
  } catch (error) {
    const failure = toMessagingError(error);
    updateOutboxEntry(conversationId, clientMessageId, {
      status: 'failed',
      retryable: failure.retryable || failure.code === 'CANCELLED',
      error: { code: failure.code, message: failure.message },
    });
    if (failure.code === 'MESSAGING_NOT_ALLOWED' || failure.code === 'NOT_FOUND') {
      void queryClient?.invalidateQueries({ queryKey: conversationsKey });
    }
  } finally {
    inFlight.delete(clientMessageId);
  }
}

/** Your stored message: replaces its outbox entry; a gap before it means something was missed. */
function settleOwnMessage(message) {
  const { conversationId } = message;
  const content = sentContent.get(message.clientMessageId);
  if (content && message.encryption === 'e2ee_v1') {
    e2eeClient.remember(message, content);
    sentContent.delete(message.clientMessageId);
  }
  const timeline = timelineOf(conversationId);
  if (!timeline.loaded) {
    // Not on screen: only settle the outbox; the history is loaded when it is opened.
    removeFromOutbox(conversationId, message.clientMessageId);
    return;
  }
  const gap = message.seq > contiguousSeq(timeline) + 1;
  mergeMessages(conversationId, [message]);
  if (gap) void syncConversation(conversationId);
}

/** What kind of attachment a picked file will become (for the optimistic preview). */
export function attachmentKindOf(file, kind) {
  if (kind === 'voice') return 'voice';
  const type = file.type.split('/')[0];
  if (type === 'image' || type === 'video' || type === 'audio') return type;
  return 'document';
}

/**
 * Queues a new message and sends it. `draft` is one of:
 * - `{ text, replyToId? }`
 * - `{ file, kind?: 'voice', text? (caption), replyToId? }`
 * - `{ sticker, replyToId? }`
 * - `{ forwardOfId, preview }` (preview: what to show until it is stored)
 */
export function sendMessage(conversationId, draft) {
  const input = typeof draft === 'string' ? { text: draft } : { ...draft };
  // End-to-end encrypted chats: files aren't end-to-end encrypted, so a caption never travels
  // with one. It is kept with the file's entry and sent as its own encrypted message once the
  // file is stored (also after a retry).
  const pendingCaption =
    input.file && input.text && cachedConversation(conversationId)?.e2ee ? input.text : null;
  if (pendingCaption) input.text = undefined;
  const clientMessageId = newClientMessageId();
  const content = {
    ...(input.text ? { text: input.text } : {}),
    ...(input.sticker ? { sticker: input.sticker } : {}),
    ...(input.replyToId ? { replyToId: input.replyToId } : {}),
    ...(input.forwardOfId ? { forwardOfId: input.forwardOfId } : {}),
    ...(input.poll ? { poll: input.poll } : {}),
  };
  if (input.poll && !input.preview) input.preview = `Poll: ${input.poll.question}`;
  const kind = input.file ? attachmentKindOf(input.file, input.kind) : null;
  addToOutbox({
    clientMessageId,
    conversationId,
    content,
    text: input.text ?? input.preview ?? '',
    sticker: input.sticker ?? null,
    replyPreview: input.replyPreview ?? null,
    ...(pendingCaption ? { pendingCaption } : {}),
    createdAt: new Date().toISOString(),
    status: 'sending',
    error: null,
    retryable: false,
    attempts: 0,
    ...(input.file
      ? {
          upload: { file: input.file, kind: input.kind, status: 'pending', progress: 0 },
          attachment: { kind, name: input.file.name, size: input.file.size },
          previewUrl:
            kind === 'image' && typeof URL.createObjectURL === 'function'
              ? URL.createObjectURL(input.file)
              : null,
        }
      : {}),
  });
  stopTyping(conversationId);
  return deliverOutgoing(conversationId, clientMessageId);
}

/** Sends a failed message again with its original idempotency key (and uploaded file). */
export function retryMessage(conversationId, clientMessageId) {
  return deliverOutgoing(conversationId, clientMessageId);
}

/** Stops an upload in progress; the message stays as "failed" with Retry. */
export function cancelUpload(clientMessageId) {
  uploads.get(clientMessageId)?.abort();
}

export function discardMessage(conversationId, clientMessageId) {
  cancelUpload(clientMessageId);
  removeFromOutbox(conversationId, clientMessageId);
}

function retryPendingMessages() {
  for (const entry of allOutboxEntries()) {
    const stuck = entry.status === 'sending' && !inFlight.has(entry.clientMessageId);
    const retryable =
      entry.status === 'failed' &&
      entry.retryable &&
      entry.error?.code !== 'CANCELLED' &&
      (entry.attempts ?? 0) < AUTO_RETRY_LIMIT;
    if (stuck || retryable) void deliverOutgoing(entry.conversationId, entry.clientMessageId);
  }
}

// ── Chat management (your own settings) ─────────────────────────────────────

/** Changes your settings for a conversation; resolves with the server's new summary. */
export async function updatePreferences(conversationId, changes) {
  const conversation = await api.updatePreferences(conversationId, changes);
  storeSummary(conversation);
  patchCachedConversation(conversationId, () => ({ preferences: conversation.preferences }));
  refreshConversations(0);
  return conversation;
}

/** Removes the conversation from your list (the other person and the messages are unaffected). */
export async function removeConversation(conversationId) {
  await api.removeConversation(conversationId);
  queryClient?.setQueriesData({ queryKey: conversationListKey }, (data) =>
    data?.pages
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.filter((item) => item.id !== conversationId),
          })),
        }
      : data,
  );
  refreshConversations(0);
}

// ── Message actions ─────────────────────────────────────────────────────────

/**
 * Edits your text message; resolves with the stored version (throws ApiError on refusal). In an
 * end-to-end encrypted chat the new text is encrypted on this device first.
 */
export async function editMessage(conversationId, messageId, text) {
  const original = timelineOf(conversationId).messages.find((item) => item.id === messageId);
  let change = text;
  let inner = null;
  if (original?.encryption === 'e2ee_v1') {
    inner = {
      msgtype: 'm.text',
      body: text,
      'connect.message': { clientMessageId: original.clientMessageId, edited: true },
    };
    change = { encrypted: await e2eeClient.encrypt(await conversationFor(conversationId), inner) };
  }
  const message = await api.editMessage(conversationId, messageId, change);
  if (inner) e2eeClient.remember(message, inner);
  mergeMessages(conversationId, [message]);
  refreshConversations();
  return message;
}

/** @param {'me' | 'everyone'} scope */
export async function deleteMessage(conversationId, messageId, scope) {
  const result = await api.deleteMessage(conversationId, messageId, scope);
  if (result.state) applyMessageState(result.state);
  if (result.message) mergeMessages(conversationId, [result.message]);
  refreshConversations();
}

/** Sets your reaction, or removes it when it is already this emoji. */
export async function toggleReaction(conversationId, message, emoji) {
  const mine = message.reactions.find((r) => r.userId === getMessagingState().selfId);
  const updated =
    mine?.emoji === emoji
      ? await api.unreact(conversationId, message.id)
      : await api.react(conversationId, message.id, emoji);
  mergeMessages(conversationId, [updated]);
}

export async function setPinned(conversationId, messageId, pinned) {
  setCachedPins(conversationId, await api.setPinned(conversationId, messageId, pinned));
}

export async function setStarred(conversationId, messageId, starred) {
  applyMessageState(await api.setStarred(conversationId, messageId, starred));
}

// ── Typing (outgoing) ───────────────────────────────────────────────────────

const typingState = new Map();

/** Call on every edit of a non-empty draft; start/stop events are throttled and debounced. */
export function notifyTyping(conversationId) {
  const now = Date.now();
  const current = typingState.get(conversationId) ?? { lastStart: 0, stopTimer: null };
  if (now - current.lastStart > TYPING_REFRESH_MS) {
    current.lastStart = now;
    emitWithAck(EVENTS.typingStart, { conversationId }).catch(() => undefined);
  }
  clearTimeout(current.stopTimer);
  current.stopTimer = setTimeout(() => stopTyping(conversationId), TYPING_IDLE_MS);
  typingState.set(conversationId, current);
}

export function stopTyping(conversationId) {
  const current = typingState.get(conversationId);
  if (!current) return;
  clearTimeout(current.stopTimer);
  typingState.delete(conversationId);
  emitWithAck(EVENTS.typingStop, { conversationId }).catch(() => undefined);
}

// ── Incoming events ─────────────────────────────────────────────────────────

function onMessageCreated({ message }) {
  if (!message?.conversationId) return;
  const { conversationId } = message;
  if (message.senderId === getMessagingState().selfId) {
    settleOwnMessage(message);
    refreshConversations();
    return;
  }
  setTyping(conversationId, 0);
  if (message.seq === knownSeq(conversationId) + 1) {
    mergeMessages(conversationId, [message]);
    void acknowledge(conversationId);
  } else {
    void syncConversation(conversationId);
  }
  refreshConversations();
}

function onDelivered({ conversationId, userId, lastDeliveredSeq }) {
  const mine = userId === getMessagingState().selfId;
  updateReceipts(
    conversationId,
    mine ? { myDeliveredSeq: lastDeliveredSeq } : { peerDeliveredSeq: lastDeliveredSeq },
  );
}

function onRead({ conversationId, userId, lastReadSeq, unreadCount }) {
  if (userId === getMessagingState().selfId) {
    updateReceipts(conversationId, { myReadSeq: lastReadSeq });
    if (typeof unreadCount === 'number') setCachedUnread(conversationId, unreadCount);
  } else {
    updateReceipts(conversationId, { peerReadSeq: lastReadSeq });
  }
}

function onTypingStart({ conversationId, userId, expiresInMs }) {
  if (userId === getMessagingState().selfId) return;
  setTyping(conversationId, expiresInMs ?? 8_000, userId);
}

function onTypingStop({ conversationId }) {
  setTyping(conversationId, 0);
}

function onUpdated({ message }) {
  if (!message?.conversationId) return;
  mergeMessages(message.conversationId, [message]);
  refreshConversations();
}

function onState(state) {
  if (state?.conversationId) applyMessageState(state);
}

function onPins({ conversationId, pins }) {
  if (conversationId && Array.isArray(pins)) setCachedPins(conversationId, pins);
}

function onPollUpdated({ conversationId, messageId, poll }) {
  if (conversationId && messageId && poll) applyPoll(conversationId, messageId, poll);
}

/** Votes on a poll (or withdraws with an empty list) and shows the server's new results. */
export async function votePoll(conversationId, messageId, pollId, optionIds) {
  const poll = optionIds.length
    ? await groupsApi.vote(conversationId, pollId, optionIds)
    : await groupsApi.retractVote(conversationId, pollId);
  applyPoll(conversationId, messageId, poll);
}

export async function closePoll(conversationId, messageId, pollId) {
  applyPoll(conversationId, messageId, await groupsApi.closePoll(conversationId, pollId));
}

/** Your chat settings changed in another tab (or this one): update caches, re-filter lists. */
function onPreferences({ conversationId, preferences, removed }) {
  if (!conversationId) return;
  if (preferences) patchCachedConversation(conversationId, () => ({ preferences }));
  if (removed || preferences) refreshConversations();
}

/** A block or unblock changed what's allowed: fetch the conversation again. */
function onChanged({ conversationId }) {
  if (!conversationId) return;
  setTyping(conversationId, 0);
  void queryClient?.invalidateQueries({ queryKey: conversationsKey });
}

function onPresence({ userId, online, lastSeenAt }) {
  setPresence(userId, { online, lastSeenAt });
}

function onConnect() {
  refreshConversations(0);
  const { timelines } = getMessagingState();
  for (const [conversationId, timeline] of Object.entries(timelines)) {
    if (timeline.loaded) void syncConversation(conversationId);
  }
  retryPendingMessages();
}

function onDisconnect() {
  // Stop events may be missed while offline; clear indicators instead of leaving them stuck.
  for (const conversationId of Object.keys(getMessagingState().typing)) {
    setTyping(conversationId, 0);
  }
}

const handlers = {
  connect: onConnect,
  disconnect: onDisconnect,
  [EVENTS.created]: onMessageCreated,
  [EVENTS.delivered]: onDelivered,
  [EVENTS.read]: onRead,
  [EVENTS.typingStart]: onTypingStart,
  [EVENTS.typingStop]: onTypingStop,
  [EVENTS.presence]: onPresence,
  [EVENTS.updated]: onUpdated,
  [EVENTS.state]: onState,
  [EVENTS.pins]: onPins,
  [EVENTS.preferences]: onPreferences,
  [EVENTS.changed]: onChanged,
  [EVENTS.pollUpdated]: onPollUpdated,
};

/** Attaches the handlers to the app's socket (and to every replacement). Returns a cleanup. */
export function startMessagingClient(client) {
  queryClient = client;
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
    if (socket.connected) onConnect();
  });
  const onVisibility = () => {
    if (activeConversationId && document.visibilityState === 'visible') {
      void markConversationRead(activeConversationId);
    }
  };
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    stopListening();
    detach();
    document.removeEventListener('visibilitychange', onVisibility);
    clearTimeout(refreshTimer);
    queryClient = null;
  };
}
