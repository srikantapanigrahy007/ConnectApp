import { callLogText } from '../calls/format';
import { formatListTimestamp } from '../../lib/format-time';

/**
 * Converts API data and store state into the view models the messaging components render
 * (see ./types.js).
 */

const NO_PRESENCE = Object.freeze({ online: null, lastSeenAt: null });

/** The freshest presence we know: a live update if one arrived, else the summary's. Groups: none. */
export function presenceOf(conversation, livePresence) {
  if (!conversation.peer) return NO_PRESENCE;
  return livePresence ?? conversation.peer.presence;
}

/** The other person's name, or the group's name. */
export function conversationTitle(conversation) {
  return conversation.group?.name ?? conversation.peer?.displayName ?? 'Conversation';
}

export function conversationAvatar(conversation) {
  return (conversation.group?.avatarUrl ?? conversation.peer?.avatarUrl) || undefined;
}

/** Who wrote messages, by user id: the other person, or the group's current members. */
export function authorsOf(conversation, groupMembers) {
  if (conversation.peer) {
    const { peer } = conversation;
    return new Map([[peer.id, { name: peer.displayName, avatarUrl: peer.avatarUrl }]]);
  }
  return new Map(
    (groupMembers ?? []).map((member) => [
      member.user.id,
      { name: member.user.displayName, avatarUrl: member.user.avatarUrl },
    ]),
  );
}

const SYSTEM_TEXT = {
  conversation_created: ({ actor, name }) => `${actor} created the group “${name}”`,
  group_renamed: ({ actor, name }) => `${actor} renamed the group to “${name}”`,
  member_added: ({ actor, target }) => `${actor} added ${target}`,
  member_joined: ({ actor }) => `${actor} joined with an invitation`,
  member_removed: ({ actor, target }) => `${actor} removed ${target}`,
  member_left: ({ actor }) => `${actor} left the group`,
  owner_changed: ({ actor, target }) => `${actor} made ${target} the owner`,
  e2ee_enabled: ({ actor }) => `${actor} turned on end-to-end encryption`,
};

/**
 * A history event line: a group event ("Ada added Grace", names from the member list) or a call
 * ("Missed audio call", from the viewer's side). Never HTML.
 */
export function systemText(system, nameOf, selfId) {
  if (!system) return 'Group updated';
  if (system.kind === 'call') return callLogText(system.call, system.actorId === selfId);
  const render = SYSTEM_TEXT[system.kind];
  if (!render) return 'Group updated';
  return render({
    actor: nameOf(system.actorId),
    target: system.targetId ? nameOf(system.targetId) : '',
    name: system.name ?? '',
  });
}

/** "Online", "Last seen …", or null when the person's privacy settings hide both. */
export function presenceLabel(presence) {
  if (presence.online) return 'Online';
  if (presence.lastSeenAt) return `Last seen ${formatListTimestamp(presence.lastSeenAt)}`;
  return null;
}

/** @returns {import('./types.js').ConversationSummary} */
export function toListItem(conversation, { selfId, presence, typing }) {
  const shown = presenceOf(conversation, presence);
  return {
    id: conversation.id,
    title: conversationTitle(conversation),
    avatarUrl: conversationAvatar(conversation),
    presence: shown.online === null ? undefined : shown.online ? 'online' : 'offline',
    isGroup: conversation.type === 'group',
    typing: Boolean(typing),
    lastMessage: conversation.lastMessage
      ? {
          preview: conversation.lastMessage.preview,
          sentAt: conversation.lastMessage.createdAt,
          fromSelf: conversation.lastMessage.senderId === selfId,
        }
      : undefined,
    unreadCount: conversation.unreadCount,
    pinned: Boolean(conversation.preferences?.pinned),
    favorite: Boolean(conversation.preferences?.favorite),
    archived: Boolean(conversation.preferences?.archived),
    muted: Boolean(conversation.preferences?.mutedUntil),
    markedUnread: Boolean(conversation.preferences?.markedUnread),
  };
}

/** Sent → delivered → read, from the other person's positions (read may be hidden: null). */
export function deliveryStatus(seq, receipts) {
  if (receipts.peerReadSeq !== null && seq <= receipts.peerReadSeq) return 'read';
  if (seq <= receipts.peerDeliveredSeq) return 'delivered';
  return 'sent';
}

/**
 * Stored messages (by seq) followed by your unsent ones (by creation time). Keys combine the
 * sender and the client message id, so a pending message keeps its key once it is stored.
 *
 * @returns {import('./types.js').ChatMessage[]}
 */
export function toChatMessages({
  messages,
  outbox,
  receipts,
  selfId,
  self,
  peer,
  authors,
  actions,
  pins = [],
  decrypt = () => undefined,
  encryptedChat = false,
}) {
  const known =
    authors ??
    new Map(peer ? [[peer.id, { name: peer.displayName, avatarUrl: peer.avatarUrl }]] : []);
  const authorOf = (senderId) => {
    if (senderId === selfId) {
      return {
        id: selfId,
        name: self?.displayName ?? 'You',
        avatarUrl: self?.avatarUrl ?? undefined,
      };
    }
    const author = known.get(senderId);
    return {
      id: senderId,
      name: author?.name ?? 'Former member',
      avatarUrl: author?.avatarUrl ?? undefined,
    };
  };
  const pinned = new Set(pins.map((pin) => pin.messageId));
  const byId = new Map(messages.map((message) => [message.id, message]));
  /** End-to-end encrypted: the text this device decrypted (empty until then). */
  const decryptedText = (message) => {
    const result = decrypt(message);
    return result?.status === 'ok' ? encryptedBodyOf(result.content) : '';
  };
  /** A reply to an encrypted message quotes this device's own decrypted copy. */
  const replyOf = (replyTo) => {
    if (replyTo?.kind !== 'encrypted') return replyTo ?? null;
    const target = byId.get(replyTo.id);
    const text = target ? decryptedText(target) : '';
    return { ...replyTo, preview: text ? text.slice(0, 120) : 'Encrypted message' };
  };

  // Messages you deleted for yourself are not shown (their seq still counts for receipts).
  const stored = messages
    .filter((message) => !message.hidden)
    .map((message) => {
      const isOwn = message.senderId === selfId;
      const encrypted = message.encryption === 'e2ee_v1';
      const decryption = encrypted && !message.deletedAt ? decrypt(message) : undefined;
      return {
        key: `${message.senderId}:${message.clientMessageId}`,
        id: message.id,
        seq: message.seq,
        body: encrypted ? decryptedText(message) : message.text,
        encrypted,
        decryption: decryption ? { status: decryption.status, reason: decryption.reason } : null,
        sentAt: message.createdAt,
        isOwn,
        author: authorOf(message.senderId),
        status: isOwn ? deliveryStatus(message.seq, receipts) : undefined,
        type: message.type ?? 'text',
        attachment: message.attachment ?? null,
        // Media is not end-to-end encrypted, even in an encrypted chat: say so.
        notEncrypted: encryptedChat && !encrypted && message.type === 'attachment',
        sticker: message.sticker ?? null,
        poll: message.poll ?? null,
        system: message.type === 'system' ? (message.system ?? null) : null,
        systemText:
          message.type === 'system'
            ? systemText(
                message.system,
                (id) => (id === selfId ? 'You' : (known.get(id)?.name ?? 'A former member')),
                selfId,
              )
            : null,
        replyTo: replyOf(message.replyTo),
        forwarded: Boolean(message.forwarded),
        editedAt: message.editedAt ?? null,
        deleted: Boolean(message.deletedAt),
        reactions: message.reactions ?? [],
        starred: Boolean(message.starred),
        pinned: pinned.has(message.id),
        source: message,
      };
    });
  const pending = [...outbox]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((entry) => ({
      key: `${selfId}:${entry.clientMessageId}`,
      id: entry.clientMessageId,
      body: entry.text,
      sentAt: entry.createdAt,
      isOwn: true,
      pending: true,
      author: authorOf(selfId),
      status: entry.status,
      error: entry.error,
      type: entry.attachment ? 'attachment' : entry.sticker ? 'sticker' : 'text',
      attachment: entry.attachment
        ? { ...entry.attachment, url: entry.previewUrl ?? null, local: true }
        : null,
      notEncrypted: encryptedChat && Boolean(entry.attachment),
      sticker: entry.sticker ?? null,
      replyTo: entry.replyPreview ?? null,
      forwarded: Boolean(entry.content?.forwardOfId),
      reactions: [],
      upload: entry.upload
        ? { status: entry.upload.status, progress: entry.upload.progress }
        : null,
      onCancelUpload:
        entry.upload?.status === 'uploading'
          ? () => actions.cancel(entry.clientMessageId)
          : undefined,
      onRetry: entry.status === 'failed' ? () => actions.retry(entry.clientMessageId) : undefined,
      onDiscard:
        entry.status === 'failed' ? () => actions.discard(entry.clientMessageId) : undefined,
    }));
  return [...stored, ...pending];
}

/** The readable text of a decrypted payload (a text message's body, or a file's caption). */
export function encryptedBodyOf(content) {
  if (content?.msgtype === 'm.text') return typeof content.body === 'string' ? content.body : '';
  const caption = content?.['connect.message']?.caption;
  return typeof caption === 'string' ? caption : '';
}

/** "1.2 MB", "340 KB", "12 bytes". */
export function formatFileSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}

/** What the composer and others show of a message being replied to. */
export function replyPreviewOf(item) {
  const kind = item.deleted ? 'deleted' : item.type;
  let preview = item.body;
  if (item.deleted) preview = 'This message was deleted';
  else if (item.encrypted && !item.body && item.type !== 'attachment')
    preview = 'Encrypted message';
  else if (item.type === 'sticker') preview = 'Sticker';
  else if (item.type === 'poll') preview = `Poll: ${item.body}`;
  else if (item.type === 'attachment') {
    const label =
      item.attachment?.kind === 'voice' ? 'Voice message' : (item.attachment?.name ?? 'Attachment');
    preview = item.body ? `${label} · ${item.body}` : label;
  }
  return { id: item.id, senderId: item.author.id, kind, preview: preview.slice(0, 120) };
}

/** Whether the server will still accept an edit / delete for everyone (its window rules). */
export function withinWindow(sentAt, seconds, now = Date.now()) {
  return seconds > 0 && now - new Date(sentAt).getTime() < seconds * 1_000;
}

/** Explains why the composer is disabled. */
export function messagingUnavailableText(reason, peer) {
  switch (reason) {
    case 'blocked_by_you':
      return `You blocked @${peer.username}. Unblock them to send messages.`;
    case 'not_connected':
      return `You're not connected with @${peer.username} any more. Send a message request to talk again.`;
    default:
      return "You can't message this person right now.";
  }
}
