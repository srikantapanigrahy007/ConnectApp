import { useSyncExternalStore } from 'react';

/**
 * Client-side messaging state that changes with real-time events:
 *
 * - timelines: loaded messages per conversation, unique by id and sorted by `seq`;
 * - outbox: the signed-in user's messages that are not stored yet ("sending" or "failed"),
 *   keyed by their clientMessageId (the idempotency key reused for every retry);
 * - receipts: delivery/read positions per conversation (yours and the other person's);
 * - typing: conversations where the other person is typing (with an expiry time);
 * - presence: online/last-seen updates pushed by the server.
 *
 * The server (MongoDB) is the source of truth; this store only mirrors what it has said, so a
 * message arriving over HTTP, a live event and a synchronisation is shown exactly once.
 * Conversation summaries (list, unread counts) live in TanStack Query.
 */

const OUTBOX_STORAGE_KEY = 'connect.outbox';

function emptyState(selfId = null) {
  return { selfId, timelines: {}, outbox: {}, receipts: {}, typing: {}, presence: {} };
}

let state = emptyState();
const listeners = new Set();

function setState(next) {
  if (next === state) return;
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getMessagingState() {
  return state;
}

/**
 * Reads part of the store. The selector must return something already in the store (not a new
 * object or array), so React only re-renders when that part changes.
 */
export function useMessagingStore(selector) {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(state),
  );
}

// ── Persistence of unsent messages (this tab only) ──────────────────────────

function loadOutbox(selfId) {
  try {
    const raw = window.sessionStorage.getItem(`${OUTBOX_STORAGE_KEY}.${selfId}`);
    const saved = raw ? JSON.parse(raw) : {};
    // After a reload nothing is in flight any more; everything is shown as failed and retried.
    return Object.fromEntries(
      Object.entries(saved).map(([conversationId, entries]) => [
        conversationId,
        entries.map((entry) => ({
          ...entry,
          status: 'failed',
          retryable: true,
          error: entry.error ?? null,
        })),
      ]),
    );
  } catch {
    return {};
  }
}

function saveOutbox() {
  if (!state.selfId) return;
  // Files can't be saved; entries still waiting for their upload live in memory only.
  const serialisable = Object.fromEntries(
    Object.entries(state.outbox).map(([conversationId, entries]) => [
      conversationId,
      entries
        .filter((entry) => !entry.upload || entry.content?.attachmentId)
        .map(({ upload: _upload, previewUrl: _previewUrl, ...entry }) => entry),
    ]),
  );
  try {
    window.sessionStorage.setItem(
      `${OUTBOX_STORAGE_KEY}.${state.selfId}`,
      JSON.stringify(serialisable),
    );
  } catch {
    // Storage may be unavailable (private mode); unsent messages then live in memory only.
  }
}

/** Starts (or switches) the store for a signed-in user; clears everything from someone else. */
export function resetMessagingStore(selfId) {
  if (state.selfId === selfId) return;
  setState({ ...emptyState(selfId), outbox: selfId ? loadOutbox(selfId) : {} });
}

// ── Timelines ───────────────────────────────────────────────────────────────

const emptyTimeline = {
  messages: [],
  /** True once the newest page has been loaded from the server. */
  loaded: false,
  status: 'idle',
  error: null,
  hasOlder: false,
  olderCursor: null,
  olderStatus: 'idle',
};

export function timelineOf(conversationId, source = state) {
  return source.timelines[conversationId] ?? emptyTimeline;
}

/** Highest seq with no gap below it (back to the oldest loaded message); 0 if none. */
export function contiguousSeq(timeline) {
  const { messages } = timeline;
  if (messages.length === 0) return 0;
  let seq = messages[0].seq;
  for (let index = 1; index < messages.length; index++) {
    if (messages[index].seq !== seq + 1) break;
    seq = messages[index].seq;
  }
  return seq;
}

export function newestSeq(timeline) {
  return timeline.messages.at(-1)?.seq ?? 0;
}

/**
 * Adds new messages and replaces known ones only with a newer `rev` (edits, deletions,
 * reactions), so updates arriving out of order or twice are harmless. Real-time updates don't
 * carry your private flags (starred, hidden); the known values are kept.
 */
function mergeSorted(existing, incoming) {
  if (incoming.length === 0) return existing;
  const byId = new Map(existing.map((message) => [message.id, message]));
  let changed = false;
  for (const message of incoming) {
    const known = byId.get(message.id);
    if (!known) {
      byId.set(message.id, message);
      changed = true;
    } else if ((message.rev ?? 0) > (known.rev ?? 0) || flagsDiffer(known, message)) {
      byId.set(message.id, {
        ...message,
        starred: message.starred ?? known.starred,
        hidden: message.hidden ?? known.hidden,
      });
      changed = true;
    }
  }
  if (!changed) return existing;
  return [...byId.values()].sort((a, b) => a.seq - b.seq);
}

const flagsDiffer = (known, message) =>
  (message.starred !== undefined && message.starred !== known.starred) ||
  (message.hidden !== undefined && message.hidden !== known.hidden);

/** Your private flags changed (message:state, or a star / delete-for-me response). */
export function applyMessageState({ conversationId, messageId, starred, hidden }) {
  const timeline = timelineOf(conversationId);
  const index = timeline.messages.findIndex((message) => message.id === messageId);
  if (index === -1) return;
  const known = timeline.messages[index];
  if (known.starred === starred && known.hidden === hidden) return;
  const messages = [...timeline.messages];
  messages[index] = { ...known, starred, hidden };
  updateTimeline(conversationId, { messages });
}

function patchTimeline(next, conversationId, patch) {
  next.timelines = {
    ...next.timelines,
    [conversationId]: { ...timelineOf(conversationId, next), ...patch },
  };
}

/**
 * Adds stored messages (from history, sync or live events). Duplicates are ignored, and your own
 * messages replace their pending outbox entries (matched by clientMessageId).
 */
export function mergeMessages(conversationId, messages, patch = {}) {
  const timeline = timelineOf(conversationId);
  const merged = mergeSorted(timeline.messages, messages);
  const own = new Set(
    messages
      .filter((message) => message.senderId === state.selfId)
      .map((message) => message.clientMessageId),
  );
  const pending = state.outbox[conversationId] ?? [];
  const remaining = pending.filter((entry) => !own.has(entry.clientMessageId));
  pending.filter((entry) => own.has(entry.clientMessageId)).forEach(releasePreview);
  if (
    merged === timeline.messages &&
    remaining.length === pending.length &&
    Object.keys(patch).length === 0
  ) {
    return;
  }

  const next = { ...state };
  patchTimeline(next, conversationId, { messages: merged, ...patch });
  if (remaining.length !== pending.length) {
    next.outbox = { ...state.outbox, [conversationId]: remaining };
  }
  setState(next);
  if (remaining.length !== pending.length) saveOutbox();
}

export function updateTimeline(conversationId, patch) {
  const next = { ...state };
  patchTimeline(next, conversationId, patch);
  setState(next);
}

/** Frees the local image preview of a pending attachment. */
function releasePreview(entry) {
  if (entry.previewUrl && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(entry.previewUrl);
  }
}

// ── Outbox ──────────────────────────────────────────────────────────────────

export function outboxOf(conversationId, source = state) {
  return source.outbox[conversationId] ?? EMPTY;
}
const EMPTY = Object.freeze([]);

export function addToOutbox(entry) {
  const list = outboxOf(entry.conversationId);
  setState({ ...state, outbox: { ...state.outbox, [entry.conversationId]: [...list, entry] } });
  saveOutbox();
}

export function updateOutboxEntry(conversationId, clientMessageId, patch) {
  const list = outboxOf(conversationId);
  if (!list.some((entry) => entry.clientMessageId === clientMessageId)) return;
  setState({
    ...state,
    outbox: {
      ...state.outbox,
      [conversationId]: list.map((entry) =>
        entry.clientMessageId === clientMessageId ? { ...entry, ...patch } : entry,
      ),
    },
  });
  saveOutbox();
}

export function removeFromOutbox(conversationId, clientMessageId) {
  const list = outboxOf(conversationId);
  list.filter((entry) => entry.clientMessageId === clientMessageId).forEach(releasePreview);
  setState({
    ...state,
    outbox: {
      ...state.outbox,
      [conversationId]: list.filter((entry) => entry.clientMessageId !== clientMessageId),
    },
  });
  saveOutbox();
}

export function allOutboxEntries() {
  return Object.values(state.outbox).flat();
}

// ── Receipts ────────────────────────────────────────────────────────────────

const emptyReceipts = {
  myDeliveredSeq: 0,
  myReadSeq: 0,
  peerDeliveredSeq: 0,
  /** Null when either person has read receipts turned off. */
  peerReadSeq: null,
};

export function receiptsOf(conversationId, source = state) {
  return source.receipts[conversationId] ?? emptyReceipts;
}

/** Positions only move forward; a hidden peer read position (null) stays hidden. */
export function updateReceipts(conversationId, patch) {
  const current = receiptsOf(conversationId);
  const next = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (value === null) next[key] = key === 'peerReadSeq' ? null : current[key];
    else next[key] = Math.max(current[key] ?? 0, value);
  }
  if (Object.keys(next).every((key) => next[key] === current[key])) return;
  setState({ ...state, receipts: { ...state.receipts, [conversationId]: next } });
}

/** Seeds receipts and presence from conversation summaries fetched over HTTP. */
export function applyConversationSummaries(conversations) {
  for (const conversation of conversations) {
    updateReceipts(conversation.id, {
      myDeliveredSeq: conversation.receipts.lastDeliveredSeq,
      myReadSeq: conversation.receipts.lastReadSeq,
      peerDeliveredSeq: conversation.peerReceipts.lastDeliveredSeq,
      peerReadSeq: conversation.peerReceipts.lastReadSeq,
    });
  }
  const presence = { ...state.presence };
  let changed = false;
  for (const conversation of conversations) {
    if (!conversation.peer) continue; // groups share no presence
    const fresh = conversation.peer.presence;
    const known = presence[conversation.peer.id];
    if (!known || known.online !== fresh.online || known.lastSeenAt !== fresh.lastSeenAt) {
      presence[conversation.peer.id] = fresh;
      changed = true;
    }
  }
  if (changed) setState({ ...state, presence });
}

// ── Typing and presence ─────────────────────────────────────────────────────

const typingTimers = new Map();

/** `typing[conversationId]` holds who is typing (a user id), or true when unknown. */
export function setTyping(conversationId, expiresInMs, userId) {
  clearTimeout(typingTimers.get(conversationId));
  if (expiresInMs > 0) {
    typingTimers.set(
      conversationId,
      setTimeout(() => setTyping(conversationId, 0), expiresInMs),
    );
    setState({ ...state, typing: { ...state.typing, [conversationId]: userId ?? true } });
  } else if (state.typing[conversationId]) {
    typingTimers.delete(conversationId);
    const typing = { ...state.typing };
    delete typing[conversationId];
    setState({ ...state, typing });
  }
}

/** New poll results (from poll:updated or your own vote); keeps your own votes when absent. */
export function applyPoll(conversationId, messageId, poll) {
  const timeline = timelineOf(conversationId);
  const index = timeline.messages.findIndex((message) => message.id === messageId);
  if (index === -1) return;
  const known = timeline.messages[index];
  const messages = [...timeline.messages];
  messages[index] = { ...known, poll: { ...poll, myVotes: poll.myVotes ?? known.poll?.myVotes } };
  updateTimeline(conversationId, { messages });
}

export function setPresence(userId, presence) {
  setState({ ...state, presence: { ...state.presence, [userId]: presence } });
}
