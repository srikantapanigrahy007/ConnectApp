import { REACTION_EMOJI } from '#shared';
import {
  Ban,
  Check,
  CheckCheck,
  CircleAlert,
  Clock,
  Copy,
  EllipsisVertical,
  Flag,
  Forward,
  Info,
  Lock,
  LockOpen,
  Pencil,
  Pin,
  PinOff,
  Reply,
  RotateCw,
  Star,
  StarOff,
  Trash2,
  X,
} from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import { DropdownMenu } from '../../../components/ui/DropdownMenu';
import { cn } from '../../../lib/cn';
import { formatMessageTime } from '../../../lib/format-time';
import { AttachmentView, ReactionChips, ReactionPicker, StickerView } from './MessageContent';
import { PollCard } from './PollCard';

/** What an end-to-end encrypted message shows until (or unless) this device can read it. */
const DECRYPTION_TEXT = {
  pending: 'Decrypting…',
  waiting: 'Waiting for the key to decrypt this message',
  failed: "Couldn't decrypt this message",
  unavailable: 'Encrypted message. Set up encryption on this browser to read it.',
};

const statusDisplay = {
  sending: { icon: Clock, label: 'Sending', className: 'text-ink-subtle' },
  sent: { icon: Check, label: 'Sent', className: 'text-ink-subtle' },
  delivered: { icon: CheckCheck, label: 'Delivered', className: 'text-ink-subtle' },
  read: { icon: CheckCheck, label: 'Read', className: 'text-primary-600' },
  failed: { icon: CircleAlert, label: 'Not sent', className: 'text-danger-700' },
};

function ReplyQuote({ replyTo, isOwn, authorName }) {
  const unavailable = replyTo.kind === 'deleted' || replyTo.kind === 'unavailable';
  return (
    <div
      className={cn(
        'mb-1.5 rounded-lg border-l-4 px-2.5 py-1 text-xs',
        isOwn ? 'border-white/60 bg-white/15' : 'border-primary-400 bg-primary-50',
      )}
    >
      <span className="block font-semibold">{authorName}</span>
      <span className={cn('line-clamp-2', unavailable && 'italic')}>{replyTo.preview}</span>
    </div>
  );
}

function UploadProgress({ upload, onCancel }) {
  if (!upload || upload.status !== 'uploading') return null;
  const percent = Math.round((upload.progress ?? 0) * 100);
  return (
    <div className="mt-1 flex items-center gap-2 text-xs">
      <div
        role="progressbar"
        aria-label="Upload progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1.5 w-32 overflow-hidden rounded-full bg-white/30"
      >
        <div className="h-full bg-white" style={{ width: `${percent}%` }} />
      </div>
      <span>Uploading {percent}%</span>
      {onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-0.5 underline"
        >
          <X aria-hidden="true" className="size-3" /> Cancel
        </button>
      ) : null}
    </div>
  );
}

/**
 * Menu items for a stored message. The server enforces every rule again; hiding an item is only
 * a convenience. `actions` comes from the conversation screen.
 */
function actionItems(message, actions) {
  if (message.deleted) {
    return [
      {
        label: 'Delete for me',
        icon: Trash2,
        tone: 'danger',
        onSelect: () => actions.delete(message),
      },
    ];
  }
  const items = [{ label: 'Reply', icon: Reply, onSelect: () => actions.reply(message) }];
  // The server can't re-encrypt an end-to-end encrypted message for another chat.
  if (!message.encrypted) {
    items.push({ label: 'Forward', icon: Forward, onSelect: () => actions.forward(message) });
  }
  if (message.body)
    items.push({ label: 'Copy text', icon: Copy, onSelect: () => actions.copy(message) });
  if (actions.canEdit(message)) {
    items.push({ label: 'Edit', icon: Pencil, onSelect: () => actions.edit(message) });
  }
  items.push(
    message.starred
      ? { label: 'Unstar', icon: StarOff, onSelect: () => actions.star(message, false) }
      : { label: 'Star', icon: Star, onSelect: () => actions.star(message, true) },
    actions.canPin === false
      ? null
      : message.pinned
        ? { label: 'Unpin', icon: PinOff, onSelect: () => actions.pin(message, false) }
        : { label: 'Pin', icon: Pin, onSelect: () => actions.pin(message, true) },
    { label: 'Message info', icon: Info, onSelect: () => actions.info(message) },
    !message.isOwn && actions.reportMessage
      ? { label: 'Report…', icon: Flag, onSelect: () => actions.reportMessage(message) }
      : null,
    { type: 'separator' },
    { label: 'Delete…', icon: Trash2, tone: 'danger', onSelect: () => actions.delete(message) },
  );
  return items.filter(Boolean);
}

/**
 * One message. All user content (text, file names, previews) is rendered as plain text — React
 * escapes it — never as HTML. Pending messages show sending/upload state; failed ones offer
 * Retry (same idempotency key) and Discard.
 */
export function MessageBubble({
  message,
  showAuthor = true,
  isGroup = false,
  selfId,
  actions,
  peerName,
}) {
  const { body, sentAt, isOwn, author, status, error, onRetry, onDiscard } = message;
  const statusInfo = isOwn && status ? statusDisplay[status] : undefined;
  const failed = status === 'failed';
  const interactive = Boolean(actions) && !message.pending;
  const sticker = message.type === 'sticker' && !message.deleted;
  const poll = message.type === 'poll' && !message.deleted && message.poll;
  // Stickers and polls carry their own look instead of a coloured bubble.
  const bare = sticker || Boolean(poll);

  return (
    <div
      className={cn('group flex items-end gap-2', isOwn ? 'justify-end' : 'justify-start')}
      data-message-id={message.id}
    >
      {!isOwn ? (
        <span className="w-8 shrink-0">
          {showAuthor ? (
            <Avatar name={author.name} src={author.avatarUrl} size="sm" decorative />
          ) : null}
        </span>
      ) : null}
      {interactive && isOwn ? (
        <MessageTools message={message} actions={actions} align="end" />
      ) : null}
      <div
        className={cn('flex max-w-[min(80%,36rem)] flex-col', isOwn ? 'items-end' : 'items-start')}
      >
        {isGroup && !isOwn && showAuthor ? (
          <span className="mb-1 px-1 text-xs font-medium text-ink-muted">{author.name}</span>
        ) : null}
        <div
          className={cn(
            'rounded-2xl text-sm leading-relaxed break-words whitespace-pre-wrap',
            bare ? 'p-1' : 'px-3.5 py-2',
            bare
              ? 'bg-transparent'
              : isOwn
                ? 'rounded-br-md bg-primary-600 text-white'
                : 'rounded-bl-md border border-border bg-surface text-ink',
            message.deleted && 'italic opacity-90',
            failed && 'ring-2 ring-danger-600 ring-offset-1 ring-offset-canvas',
          )}
        >
          <span className="sr-only">{isOwn ? 'You' : author.name}: </span>
          {message.forwarded && !message.deleted ? (
            <span
              className={cn(
                'mb-1 flex items-center gap-1 text-xs',
                isOwn ? 'text-white/80' : 'text-ink-muted',
              )}
            >
              <Forward aria-hidden="true" className="size-3.5" /> Forwarded
            </span>
          ) : null}
          {message.replyTo && !message.deleted ? (
            <ReplyQuote
              replyTo={message.replyTo}
              isOwn={isOwn && !bare}
              authorName={
                message.replyTo.senderId === selfId
                  ? 'You'
                  : (actions?.nameOf?.(message.replyTo.senderId) ?? peerName ?? 'Them')
              }
            />
          ) : null}
          {message.deleted ? (
            <span className="inline-flex items-center gap-1.5">
              <Ban aria-hidden="true" className="size-3.5" /> This message was deleted
            </span>
          ) : (
            <>
              {sticker ? <StickerView id={message.sticker} /> : null}
              {poll ? (
                <PollCard
                  poll={message.poll}
                  canClose={Boolean(actions?.canClosePoll?.(message))}
                  onVote={(optionIds) => actions.vote(message, optionIds)}
                  onClose={() => actions.closePoll(message)}
                />
              ) : null}
              {message.type === 'attachment' && message.attachment ? (
                <AttachmentView attachment={message.attachment} isOwn={isOwn} />
              ) : null}
              {message.notEncrypted ? (
                <span
                  className={cn(
                    'mt-1 flex items-center gap-1 text-xs',
                    isOwn ? 'text-white/80' : 'text-ink-muted',
                  )}
                >
                  <LockOpen aria-hidden="true" className="size-3" />
                  Not end-to-end encrypted
                </span>
              ) : null}
              {message.decryption && message.decryption.status !== 'ok' ? (
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 italic',
                    isOwn ? 'text-white/90' : 'text-ink-muted',
                  )}
                >
                  <Lock aria-hidden="true" className="size-3.5" />
                  {DECRYPTION_TEXT[message.decryption.status] ?? DECRYPTION_TEXT.failed}
                </span>
              ) : null}
              {body && !poll ? (
                <span className={cn(message.type === 'attachment' && 'mt-1.5 block')}>{body}</span>
              ) : null}
            </>
          )}
          <UploadProgress upload={message.upload} onCancel={message.onCancelUpload} />
        </div>
        <ReactionChips
          reactions={message.reactions ?? []}
          selfId={selfId}
          align={isOwn ? 'end' : 'start'}
          onToggle={interactive ? (emoji) => actions.react(message, emoji) : undefined}
        />
        <span className="mt-1 flex items-center gap-1 px-1 text-xs text-ink-muted">
          {message.starred ? (
            <Star aria-label="Starred" className="size-3.5 fill-warning-500 text-warning-500" />
          ) : null}
          {message.pinned ? <Pin aria-label="Pinned" className="size-3.5" /> : null}
          <time dateTime={sentAt}>{formatMessageTime(sentAt)}</time>
          {message.editedAt && !message.deleted ? <span>· Edited</span> : null}
          {statusInfo && !message.deleted ? (
            <span className={cn('inline-flex items-center gap-0.5', statusInfo.className)}>
              <statusInfo.icon aria-hidden="true" className="size-3.5" />
              <span className={failed ? undefined : 'sr-only'}>{statusInfo.label}</span>
            </span>
          ) : null}
        </span>
        {failed ? (
          <div className="mt-1 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 px-1 text-xs">
            {error?.message ? <span className="text-danger-700">{error.message}</span> : null}
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1 font-medium text-primary-700 hover:underline"
              >
                <RotateCw aria-hidden="true" className="size-3.5" />
                Retry
              </button>
            ) : null}
            {onDiscard ? (
              <button
                type="button"
                onClick={onDiscard}
                className="inline-flex items-center gap-1 font-medium text-ink-muted hover:text-ink hover:underline"
              >
                <Trash2 aria-hidden="true" className="size-3.5" />
                Discard
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {interactive && !isOwn ? (
        <MessageTools message={message} actions={actions} align="start" />
      ) : null}
    </div>
  );
}

/** Reaction button + action menu next to a message (always reachable by keyboard). */
function MessageTools({ message, actions, align }) {
  return (
    <div className="flex shrink-0 items-center self-center opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
      {!message.deleted && actions.canReact ? (
        <ReactionPicker emoji={REACTION_EMOJI} onPick={(emoji) => actions.react(message, emoji)} />
      ) : null}
      <DropdownMenu
        label="Message actions"
        align={align}
        side="top"
        triggerClassName="inline-flex size-7 items-center justify-center rounded-full text-ink-muted hover:bg-surface-muted hover:text-ink"
        trigger={<EllipsisVertical aria-hidden="true" className="size-4" />}
        items={actionItems(message, actions)}
      />
    </div>
  );
}
