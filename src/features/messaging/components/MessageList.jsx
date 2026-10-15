import { Phone, PhoneMissed, Video } from 'lucide-react';
import { Fragment } from 'react';
import { formatDaySeparator, isSameDay } from '../../../lib/format-time';

import { MessageBubble } from './MessageBubble';

/** Calls in the history: a missed/declined/failed call shows the "missed" icon. */
function CallLogIcon({ call }) {
  const Icon = call?.status === 'completed' ? (call.type === 'video' ? Video : Phone) : PhoneMissed;
  return <Icon aria-hidden="true" className="size-3.5 shrink-0" />;
}

export function DaySeparator({ label }) {
  return (
    <div className="flex items-center gap-3 py-2" role="separator" aria-label={label}>
      <span className="h-px flex-1 bg-border" />
      <span className="text-xs font-medium text-ink-muted">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/**
 * Chronological message log with day separators and grouped consecutive messages. Items keep a
 * stable `key` (sender + client message id), so an optimistic message turns into the stored
 * one without being re-created.
 */
export function MessageList({ messages, isGroup = false, label, selfId, actions, peerName }) {
  return (
    <div role="log" aria-label={label} className="space-y-2">
      {messages.map((message, index) => {
        const previous = messages[index - 1];
        const newDay = !previous || !isSameDay(previous.sentAt, message.sentAt);
        const showAuthor =
          newDay || previous.type === 'system' || previous.author.id !== message.author.id;
        if (message.type === 'system') {
          // Group events ("Ada added Grace"): a centred note, not a bubble.
          return (
            <Fragment key={message.key ?? message.id}>
              {newDay ? <DaySeparator label={formatDaySeparator(message.sentAt)} /> : null}
              <p
                data-message-key={message.key ?? message.id}
                className="mx-auto flex w-fit max-w-full items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1 text-center text-xs text-ink-muted"
              >
                {message.system?.kind === 'call' ? (
                  <CallLogIcon call={message.system.call} />
                ) : null}
                {message.systemText}
              </p>
            </Fragment>
          );
        }
        return (
          <Fragment key={message.key ?? message.id}>
            {newDay ? <DaySeparator label={formatDaySeparator(message.sentAt)} /> : null}
            <div data-message-key={message.key ?? message.id}>
              <MessageBubble
                message={message}
                showAuthor={showAuthor}
                isGroup={isGroup}
                selfId={selfId}
                actions={actions}
                peerName={peerName}
              />
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
