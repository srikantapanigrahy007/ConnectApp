import { Pin, PinOff, Star } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '../../../components/ui/Avatar';
import { Button, IconButton } from '../../../components/ui/Button';
import { Dialog } from '../../../components/ui/Dialog';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Checkbox } from '../../../components/ui/FormControls';
import { ListSkeleton } from '../../../components/ui/Skeleton';
import { formatListTimestamp } from '../../../lib/format-time';
import { useConversations, useStarredMessages } from '../hooks';
import { conversationAvatar, conversationTitle, withinWindow } from '../view-models';

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Choose conversations to forward a message to (only ones you can message right now). */
export function ForwardDialog({ open, onClose, onForward, currentConversationId }) {
  const conversations = useConversations();
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const all = (conversations.data?.pages ?? []).flatMap((page) => page.items);
  const permitted = all.filter((conversation) => conversation.canMessage);

  const toggle = (id) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Forward message"
      description="It's sent as a new message from you, marked “Forwarded”. The original sender isn't shown."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={selected.size === 0}
            onClick={async () => {
              setBusy(true);
              try {
                await onForward([...selected]);
                setSelected(new Set());
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {selected.size > 1 ? `Forward to ${selected.size} chats` : 'Forward'}
          </Button>
        </>
      }
    >
      {conversations.isPending ? (
        <ListSkeleton rows={3} label="Loading conversations…" />
      ) : conversations.isError ? (
        <ErrorState
          message={conversations.error.message}
          onRetry={() => void conversations.refetch()}
        />
      ) : permitted.length === 0 ? (
        <p className="text-sm text-ink-muted">There's no one you can forward to right now.</p>
      ) : (
        <ul className="max-h-80 space-y-1 overflow-y-auto" aria-label="Conversations">
          {permitted.map((conversation) => (
            <li key={conversation.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
              <Avatar
                name={conversationTitle(conversation)}
                src={conversationAvatar(conversation)}
                size="sm"
                decorative
              />
              <Checkbox
                label={`${conversationTitle(conversation)}${
                  conversation.id === currentConversationId ? ' (this chat)' : ''
                }`}
                checked={selected.has(conversation.id)}
                onChange={() => toggle(conversation.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

/** Delete for me always; delete for everyone only for your own message within the window. */
export function DeleteMessageDialog({ message, rules, onClose, onDelete }) {
  const [busy, setBusy] = useState(null);
  if (!message) return null;
  const forEveryone =
    message.isOwn &&
    !message.deleted &&
    withinWindow(message.sentAt, rules?.deleteWindowSeconds ?? 0);
  const run = async (scope) => {
    setBusy(scope);
    try {
      await onDelete(message, scope);
      onClose();
    } finally {
      setBusy(null);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title="Delete message?"
      description={
        forEveryone
          ? '“Delete for everyone” removes it for both of you. “Delete for me” only hides it from your view.'
          : 'This hides the message from your view only. The other person still sees it.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            loading={busy === 'me'}
            disabled={Boolean(busy)}
            onClick={() => void run('me')}
          >
            Delete for me
          </Button>
          {forEveryone ? (
            <Button
              variant="danger"
              loading={busy === 'everyone'}
              disabled={Boolean(busy)}
              onClick={() => void run('everyone')}
            >
              Delete for everyone
            </Button>
          ) : null}
        </>
      }
    />
  );
}

/** Timestamps and receipt state, as far as privacy settings allow. */
export function MessageInfoDialog({ message, receipts, onClose }) {
  if (!message) return null;
  const rows = [['Sent', dateTime.format(new Date(message.sentAt))]];
  if (message.editedAt) rows.push(['Edited', dateTime.format(new Date(message.editedAt))]);
  if (message.isOwn) {
    rows.push(['Delivered', message.seq <= receipts.peerDeliveredSeq ? 'Yes' : 'Not yet']);
    rows.push([
      'Read',
      receipts.peerReadSeq === null
        ? 'Hidden (read receipts are off)'
        : message.seq <= receipts.peerReadSeq
          ? 'Yes'
          : 'Not yet',
    ]);
  }
  if (message.attachment) {
    rows.push(['Attachment', `${message.attachment.name}`]);
  }
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title="Message info"
      footer={<Button onClick={onClose}>Close</Button>}
    >
      <dl className="space-y-2 text-sm">
        {rows.map(([term, value]) => (
          <div key={term} className="flex justify-between gap-4">
            <dt className="text-ink-muted">{term}</dt>
            <dd className="text-right font-medium text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-xs text-ink-muted">
        Connect records whether a message was delivered and read, but not the exact time.
      </p>
    </Dialog>
  );
}

export function StarredDialog({ open, conversationId, onClose }) {
  const starred = useStarredMessages(conversationId, open);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Starred messages"
      description="Only you can see what you starred."
      footer={<Button onClick={onClose}>Close</Button>}
    >
      {starred.isPending ? (
        <ListSkeleton rows={3} label="Loading starred messages…" />
      ) : starred.isError ? (
        <ErrorState message={starred.error.message} onRetry={() => void starred.refetch()} />
      ) : starred.data.length === 0 ? (
        <EmptyState
          icon={Star}
          title="No starred messages"
          description="Star a message from its menu to find it here."
        />
      ) : (
        <ul className="max-h-96 space-y-2 overflow-y-auto">
          {starred.data.map((message) => (
            <li key={message.id} className="rounded-lg border border-border p-3 text-sm">
              <p className="text-xs text-ink-muted">{formatListTimestamp(message.createdAt)}</p>
              <p className="whitespace-pre-wrap text-ink">
                {message.text ||
                  (message.attachment ? message.attachment.name : message.sticker ? 'Sticker' : '')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

/** Pinned messages under the conversation header; selecting one scrolls to it if loaded. */
export function PinnedBar({ pins, onShow, onUnpin }) {
  if (!pins?.length) return null;
  return (
    <section
      aria-label="Pinned messages"
      className="border-b border-border bg-primary-50 px-4 py-1.5"
    >
      <ul className="space-y-0.5">
        {pins.map((pin) => (
          <li key={pin.messageId} className="flex items-center gap-2 text-xs">
            <Pin aria-hidden="true" className="size-3.5 shrink-0 text-primary-700" />
            <button
              type="button"
              onClick={() => onShow(pin)}
              className="min-w-0 flex-1 truncate text-left text-ink hover:underline"
            >
              {pin.preview}
            </button>
            {onUnpin ? (
              <IconButton
                label="Unpin message"
                icon={PinOff}
                size="sm"
                onClick={() => onUnpin(pin)}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
