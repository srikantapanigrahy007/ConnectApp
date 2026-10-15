import { useQueryClient } from '@tanstack/react-query';
import { MessageCircleOff, MessagesSquare } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { Alert } from '../../../components/ui/Alert';
import { Button, ButtonLink } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useToast } from '../../../components/ui/toast-context';
import { usePageTitle } from '../../../hooks/use-page-title';
import { ApiError } from '../../../lib/api-client';
import { useSession } from '../../auth/hooks';
import { EncryptionDialog } from '../../e2ee/EncryptionDialog';
import {
  useDecryptedMessages,
  useE2eeServerStatus,
  useE2eeState,
  usePeerDevices,
} from '../../e2ee/hooks';
import { useGroup } from '../../groups/hooks';
import { ReportDialog } from '../../reports/ReportDialog';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { CallButtons } from '../../calls/components/CallButtons';
import { ConversationHeader } from '../components/ConversationHeader';
import { CreatePollDialog } from '../components/CreatePollDialog';
import { MessageComposer } from '../components/MessageComposer';
import {
  DeleteMessageDialog,
  ForwardDialog,
  MessageInfoDialog,
  PinnedBar,
  StarredDialog,
} from '../components/MessageDialogs';
import { MessageList } from '../components/MessageList';
import { isConversationId, useConversation, useConversationTimeline } from '../hooks';
import {
  cancelUpload,
  closePoll,
  conversationsKey,
  deleteMessage,
  discardMessage,
  editMessage,
  loadOlderMessages,
  loadTimeline,
  notifyTyping,
  retryMessage,
  sendMessage,
  setPinned,
  setStarred,
  stopTyping,
  toggleReaction,
  updatePreferences,
  votePoll,
} from '../messaging-client';
import { receiptsOf, useMessagingStore } from '../store';
import {
  authorsOf,
  conversationAvatar,
  conversationTitle,
  messagingUnavailableText,
  presenceLabel,
  presenceOf,
  replyPreviewOf,
  toChatMessages,
  withinWindow,
} from '../view-models';

/** How close to the bottom (px) still counts as "at the bottom" for auto-scrolling. */
const STICK_THRESHOLD_PX = 96;

function MessagesSkeleton() {
  return (
    <div role="status" className="space-y-3">
      <span className="sr-only">Loading messages…</span>
      <Skeleton className="h-9 w-48 rounded-2xl" />
      <Skeleton className="ml-auto h-9 w-56 rounded-2xl" />
      <Skeleton className="h-14 w-64 rounded-2xl" />
      <Skeleton className="ml-auto h-9 w-40 rounded-2xl" />
    </div>
  );
}

function TypingIndicator({ name }) {
  return (
    <div aria-hidden="true" className="flex items-center gap-2 pt-2 pl-10 text-xs text-ink-muted">
      <span className="inline-flex gap-1 rounded-full border border-border bg-surface px-3 py-2">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="size-1.5 rounded-full bg-ink-subtle motion-safe:animate-bounce"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
      {name} is typing…
    </div>
  );
}

/**
 * Keeps the scroll position sensible: starts at the newest message, follows new messages only
 * while you're at the bottom (or when you send one), and keeps the message you were looking at
 * in place when older messages are inserted above it. Message keys are "<userId>:<uuid>" (hex,
 * "-" and ":"), so they are safe inside a quoted attribute selector.
 */
function useScrollManagement(items, olderStatus) {
  const scrollRef = useRef(null);
  const atBottom = useRef(true);
  const anchor = useRef(null);
  const lastKey = useRef(null);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX;
  }, []);

  /** Remembers where the first visible message sits before older messages are added. */
  const rememberAnchor = useCallback((firstKey) => {
    const el = scrollRef.current;
    const node = el?.querySelector(`[data-message-key="${firstKey}"]`);
    if (!el || !node) return;
    anchor.current = { key: firstKey, offset: node.getBoundingClientRect().top };
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const newest = items.at(-1);
    const newestChanged = newest && newest.key !== lastKey.current;
    lastKey.current = newest?.key ?? null;

    if (anchor.current && olderStatus !== 'loading') {
      const node = el.querySelector(`[data-message-key="${anchor.current.key}"]`);
      if (node) el.scrollTop += node.getBoundingClientRect().top - anchor.current.offset;
      anchor.current = null;
      return;
    }
    if (newestChanged && (atBottom.current || newest.isOwn)) {
      el.scrollTop = el.scrollHeight;
      atBottom.current = true;
    }
  }, [items, olderStatus]);

  return { scrollRef, onScroll, rememberAnchor };
}

function ConversationView({ conversation, self }) {
  const { id, peer } = conversation;
  const isGroup = conversation.type === 'group';
  const title = conversationTitle(conversation);
  const isGroupAdmin = isGroup && ['owner', 'admin'].includes(conversation.group?.myRole);
  // Group member names resolve message authors and event lines.
  const groupQuery = useGroup(isGroup ? id : null);
  const members = groupQuery.data?.members;
  const authors = useMemo(() => authorsOf(conversation, members), [conversation, members]);
  const { timeline, outbox } = useConversationTimeline(id);
  const receipts = useMessagingStore((state) => receiptsOf(id, state));
  const livePresence = useMessagingStore((state) => (peer ? state.presence[peer.id] : undefined));
  const typingUser = useMessagingStore((state) => state.typing[id]);
  const typing = Boolean(typingUser);
  const typistName =
    (typeof typingUser === 'string' ? authors.get(typingUser)?.name : null) ??
    (isGroup ? 'Someone' : title);

  const { toast } = useToast();
  const [replyTarget, setReplyTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [forwardTarget, setForwardTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [infoTarget, setInfoTarget] = useState(null);
  const [reportTarget, setReportTarget] = useState(null);
  const [starredOpen, setStarredOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [encryptionOpen, setEncryptionOpen] = useState(false);
  const queryClient = useQueryClient();
  const { canMessage, rules, pins } = conversation;
  // End-to-end encryption (direct chats, opt-in): messages are decrypted on this device.
  const encrypted = Boolean(conversation.e2ee);
  const e2ee = useE2eeState();
  const serverE2ee = useE2eeServerStatus(!isGroup && !encrypted);
  const decrypt = useDecryptedMessages(timeline.messages);
  // Any of their devices not verified here (new devices start unverified): warn.
  const peerDevices = usePeerDevices(peer?.id, encrypted && e2ee.status === 'ready');
  const unverifiedDevices = (peerDevices.data ?? []).some((device) => !device.verified);

  // Opening a chat you marked as unread counts as reading it.
  const markedUnread = Boolean(conversation.preferences?.markedUnread);
  useEffect(() => {
    if (markedUnread) void updatePreferences(id, { markedUnread: false }).catch(() => undefined);
  }, [id, markedUnread]);

  const actions = useMemo(
    () => ({
      retry: (clientMessageId) => void retryMessage(id, clientMessageId),
      discard: (clientMessageId) => discardMessage(id, clientMessageId),
      cancel: (clientMessageId) => cancelUpload(clientMessageId),
    }),
    [id],
  );
  const items = useMemo(
    () =>
      toChatMessages({
        messages: timeline.messages,
        outbox,
        receipts,
        selfId: self.id,
        self,
        authors,
        actions,
        pins,
        decrypt,
        encryptedChat: encrypted,
      }),
    [timeline.messages, outbox, receipts, self, authors, actions, pins, decrypt, encrypted],
  );

  /** Shows the server's reason when an action is refused; the UI never assumes success. */
  const report = useCallback(
    (promise, success) =>
      promise.then(
        () => {
          if (success) toast({ tone: 'success', title: success });
        },
        (error) => {
          toast({
            tone: 'danger',
            title: error instanceof ApiError ? error.message : 'Something went wrong. Try again.',
          });
          throw error;
        },
      ),
    [toast],
  );

  const messageActions = useMemo(
    () => ({
      canReact: canMessage,
      // Groups: only admins pin; polls close for their creator or an admin.
      canPin: !isGroup || isGroupAdmin,
      canClosePoll: (message) =>
        Boolean(message.poll) &&
        !message.poll.closed &&
        (message.poll.creatorId === self.id || isGroupAdmin),
      nameOf: (userId) => authors.get(userId)?.name,
      vote: (message, optionIds) => report(votePoll(id, message.id, message.poll.id, optionIds)),
      closePoll: (message) => report(closePoll(id, message.id, message.poll.id), 'Poll closed'),
      canEdit: (message) =>
        canMessage &&
        message.isOwn &&
        message.type === 'text' &&
        !message.deleted &&
        withinWindow(message.sentAt, rules?.editWindowSeconds ?? 0),
      reply: (message) => {
        setEditTarget(null);
        setReplyTarget(message);
      },
      forward: setForwardTarget,
      copy: (message) =>
        void navigator.clipboard?.writeText(message.body).then(
          () => toast({ title: 'Copied' }),
          () => toast({ tone: 'danger', title: "Couldn't copy the text" }),
        ),
      edit: (message) => {
        setReplyTarget(null);
        setEditTarget(message);
      },
      star: (message, on) =>
        void report(setStarred(id, message.id, on), on ? 'Starred' : 'Removed from starred').catch(
          () => undefined,
        ),
      pin: (message, on) =>
        void report(setPinned(id, message.id, on), on ? 'Pinned' : 'Unpinned').catch(
          () => undefined,
        ),
      info: setInfoTarget,
      reportMessage: setReportTarget,
      delete: setDeleteTarget,
      react: (message, emoji) =>
        void report(toggleReaction(id, message.source, emoji)).catch(() => undefined),
    }),
    [
      authors,
      canMessage,
      id,
      isGroup,
      isGroupAdmin,
      report,
      rules?.editWindowSeconds,
      self.id,
      toast,
    ],
  );

  /** Content shared by every kind of new message: the reply, if one is being composed. */
  const replyFields = () =>
    replyTarget ? { replyToId: replyTarget.id, replyPreview: replyPreviewOf(replyTarget) } : {};
  const sendDraft = (draft) => {
    void sendMessage(id, { ...draft, ...replyFields() });
    setReplyTarget(null);
  };

  const showPin = (pin) => {
    const node = scrollRef.current?.querySelector(`[data-message-id="${pin.messageId}"]`);
    if (node) {
      node.scrollIntoView({ block: 'center', behavior: 'smooth' });
      node.querySelector('button, a')?.focus({ preventScroll: true });
    } else {
      toast({ title: 'Load older messages to see this pinned message.' });
    }
  };

  const { scrollRef, onScroll, rememberAnchor } = useScrollManagement(items, timeline.olderStatus);
  const sentinelRef = useRef(null);

  const loadOlder = useCallback(() => {
    if (items[0]) rememberAnchor(items[0].key);
    void loadOlderMessages(id);
  }, [id, items, rememberAnchor]);

  // Load older messages automatically when the top of the history scrolls into view.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadOlder();
      },
      { root: scrollRef.current, rootMargin: '200px 0px 0px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadOlder, scrollRef, timeline.hasOlder]);

  const presence = presenceOf(conversation, livePresence);
  const subtitle = typing
    ? isGroup
      ? `${typistName} is typing…`
      : 'typing…'
    : isGroup
      ? `${conversation.group.memberCount} ${conversation.group.memberCount === 1 ? 'member' : 'members'}`
      : presenceLabel(presence);
  const unavailable = canMessage
    ? encrypted && e2ee.status !== 'ready'
      ? e2ee.status === 'starting'
        ? 'Setting up encryption on this browser…'
        : 'This chat is end-to-end encrypted. To send messages, set up encryption on this browser under chat options → End-to-end encryption.'
      : null
    : messagingUnavailableText(conversation.messagingUnavailableReason, peer);

  let body;
  if (!timeline.loaded && timeline.status === 'error') {
    body = (
      <ErrorState
        title="Couldn't load messages"
        message={timeline.error?.message ?? 'Please try again.'}
        onRetry={() => void loadTimeline(id)}
      />
    );
  } else if (!timeline.loaded) {
    body = <MessagesSkeleton />;
  } else if (items.length === 0) {
    body = (
      <EmptyState
        icon={MessagesSquare}
        headingLevel={2}
        title="No messages yet"
        description={isGroup ? 'Say hello to the group.' : `Say hello to ${title}.`}
      />
    );
  } else {
    body = (
      <MessageList
        messages={items}
        label={`Messages with ${title}`}
        selfId={self.id}
        actions={messageActions}
        peerName={title}
        isGroup={isGroup}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <ConversationHeader
        title={title}
        subtitle={subtitle}
        avatarName={title}
        avatarUrl={conversationAvatar(conversation)}
        presence={presence.online === null ? undefined : presence.online ? 'online' : 'offline'}
        profileHref={
          isGroup ? `/groups/${id}` : peer?.username ? `/users/${peer.username}` : undefined
        }
        onShowStarred={() => setStarredOpen(true)}
        encrypted={encrypted}
        onShowEncryption={
          encrypted || serverE2ee.data?.enabled ? () => setEncryptionOpen(true) : undefined
        }
        callActions={
          isGroup ? null : (
            <CallButtons
              conversationId={id}
              peerName={title}
              unavailable={canMessage ? null : 'not available in this conversation'}
            />
          )
        }
      />
      <PinnedBar
        pins={pins}
        onShow={showPin}
        onUnpin={(pin) =>
          void report(setPinned(id, pin.messageId, false), 'Unpinned').catch(() => undefined)
        }
      />
      <ConnectionStatus className="mx-4 mt-2" />
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="relative min-h-0 flex-1 scrollbar-none overflow-y-auto overscroll-contain px-4 py-4"
      >
        {timeline.loaded && timeline.hasOlder ? (
          <div ref={sentinelRef} className="flex justify-center pb-3">
            <Button
              variant="secondary"
              size="sm"
              loading={timeline.olderStatus === 'loading'}
              onClick={loadOlder}
            >
              {timeline.olderStatus === 'error'
                ? "Couldn't load older messages. Try again"
                : 'Load older messages'}
            </Button>
          </div>
        ) : timeline.loaded && items.length > 0 ? (
          <p className="pb-3 text-center text-xs text-ink-muted">
            This is the start of your conversation with {title}.
          </p>
        ) : null}
        {body}
        {typing ? <TypingIndicator name={typistName} /> : null}
      </div>
      {encrypted && unverifiedDevices && !unavailable ? (
        <Alert tone="warning" role="status" className="mx-3 mb-2 sm:mx-4">
          {title} has a device you haven’t verified, possibly a new one. Before sharing anything
          sensitive, compare emoji under chat options → End-to-end encryption.
        </Alert>
      ) : null}
      {unavailable ? (
        <Alert tone="warning" role="status" className="mx-3 mb-2 sm:mx-4">
          {unavailable}
        </Alert>
      ) : null}
      <MessageComposer
        key={id}
        draftKey={id}
        onSend={canMessage && !unavailable ? (text) => sendDraft({ text }) : undefined}
        onAttach={
          // Encrypted chats: the file is encrypted on this device before upload.
          canMessage && !unavailable
            ? (file, { caption, kind }) => sendDraft({ file, kind, text: caption })
            : undefined
        }
        onSticker={
          canMessage && !unavailable && !encrypted ? (sticker) => sendDraft({ sticker }) : undefined
        }
        onCreatePoll={canMessage && isGroup ? () => setPollOpen(true) : undefined}
        onTyping={() => notifyTyping(id)}
        onStopTyping={() => stopTyping(id)}
        disabledReason={unavailable ?? undefined}
        replyTo={
          replyTarget
            ? {
                authorName: replyTarget.isOwn ? 'yourself' : replyTarget.author.name,
                preview: replyPreviewOf(replyTarget).preview,
              }
            : null
        }
        onCancelReply={() => setReplyTarget(null)}
        editing={editTarget ? { id: editTarget.id, text: editTarget.body } : null}
        onSaveEdit={(text) => report(editMessage(id, editTarget.id, text))}
        onCancelEdit={() => setEditTarget(null)}
      />
      {forwardTarget ? (
        <ForwardDialog
          open
          currentConversationId={id}
          onClose={() => setForwardTarget(null)}
          onForward={(conversationIds) => {
            for (const conversationId of conversationIds) {
              void sendMessage(conversationId, {
                forwardOfId: forwardTarget.id,
                preview: replyPreviewOf(forwardTarget).preview,
              });
            }
            toast({
              tone: 'success',
              title:
                conversationIds.length > 1
                  ? `Forwarding to ${conversationIds.length} chats`
                  : 'Forwarding',
            });
            return Promise.resolve();
          }}
        />
      ) : null}
      <DeleteMessageDialog
        message={deleteTarget}
        rules={rules}
        onClose={() => setDeleteTarget(null)}
        onDelete={(message, scope) =>
          report(
            deleteMessage(id, message.id, scope),
            scope === 'everyone' ? 'Deleted for everyone' : 'Deleted for you',
          )
        }
      />
      <MessageInfoDialog
        message={infoTarget}
        receipts={receipts}
        onClose={() => setInfoTarget(null)}
      />
      <ReportDialog
        open={Boolean(reportTarget)}
        onClose={() => setReportTarget(null)}
        target={
          reportTarget ? { type: 'message', id: reportTarget.id, name: 'this message' } : null
        }
      />
      <CreatePollDialog
        open={pollOpen}
        onClose={() => setPollOpen(false)}
        onCreate={(poll) => sendDraft({ poll })}
      />
      <StarredDialog open={starredOpen} conversationId={id} onClose={() => setStarredOpen(false)} />
      {encryptionOpen ? (
        <EncryptionDialog
          open
          conversation={conversation}
          selfId={self.id}
          onClose={() => setEncryptionOpen(false)}
          onChanged={() => void queryClient.invalidateQueries({ queryKey: conversationsKey })}
        />
      ) : null}
    </div>
  );
}

function ConversationUnavailable({ title, description }) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <ConversationHeader title="Conversation" />
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4">
        <EmptyState
          icon={MessageCircleOff}
          headingLevel={2}
          title={title}
          description={description}
          action={
            <ButtonLink to="/chats" variant="secondary" size="sm">
              Back to chats
            </ButtonLink>
          }
        />
      </div>
    </div>
  );
}

/** One conversation at /chats/:conversationId. Only its two participants can open it. */
export function ConversationPage() {
  const { conversationId = '' } = useParams();
  const { user } = useSession();
  const conversation = useConversation(conversationId);
  usePageTitle(conversation.data ? conversationTitle(conversation.data) : 'Conversation');

  const notFound =
    !isConversationId(conversationId) ||
    (conversation.error instanceof ApiError && conversation.error.status === 404);

  if (notFound) {
    return (
      <ConversationUnavailable
        title="Conversation not found"
        description="It may have been removed, or you aren't part of it."
      />
    );
  }
  if (conversation.isPending) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-canvas">
        <ConversationHeader title="Conversation" subtitle="Loading…" />
        <div className="min-h-0 flex-1 px-4 py-4">
          <MessagesSkeleton />
        </div>
      </div>
    );
  }
  if (conversation.isError) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-canvas">
        <ConversationHeader title="Conversation" />
        <div className="p-4">
          <ErrorState
            title="Couldn't load this conversation"
            message={conversation.error.message}
            onRetry={() => void conversation.refetch()}
            isRetrying={conversation.isFetching}
          />
        </div>
      </div>
    );
  }
  return <ConversationView conversation={conversation.data} self={user} />;
}
