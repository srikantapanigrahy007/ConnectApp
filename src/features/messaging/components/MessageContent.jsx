import { STICKERS } from '#shared';
import { Download, FileText, Mic, SmilePlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { apiUrl } from '../../../config/env';
import { cn } from '../../../lib/cn';
import { formatFileSize } from '../view-models';

const KIND_LABELS = {
  image: 'Photo',
  video: 'Video',
  audio: 'Audio',
  voice: 'Voice message',
  document: 'Document',
};

function DocumentCard({ attachment, isOwn }) {
  const href = attachment.url && !attachment.local ? `${apiUrl(attachment.url)}?download=1` : null;
  return (
    <div
      className={cn(
        'flex min-w-56 items-center gap-3 rounded-xl border p-3',
        isOwn ? 'border-white/30 bg-white/10' : 'border-border bg-surface-muted',
      )}
    >
      <FileText aria-hidden="true" className="size-8 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{attachment.name}</p>
        <p className={cn('text-xs', isOwn ? 'text-white/80' : 'text-ink-muted')}>
          {attachment.contentType
            ? `${attachment.contentType.split('/').pop().toUpperCase()} · `
            : ''}
          {formatFileSize(attachment.size)}
        </p>
      </div>
      {href ? (
        <a
          href={href}
          download={attachment.name}
          aria-label={`Download ${attachment.name}`}
          title="Download"
          className={cn(
            'inline-flex size-9 items-center justify-center rounded-lg',
            isOwn ? 'hover:bg-white/20' : 'hover:bg-surface',
          )}
        >
          <Download aria-hidden="true" className="size-4" />
        </a>
      ) : null}
    </div>
  );
}

/**
 * An attachment inside a message. Files are loaded from the API, which checks your access on
 * every request; nothing here is a public link. Names are shown as text only.
 */
export function AttachmentView({ attachment, isOwn }) {
  const src = attachment.local ? attachment.url : attachment.url ? apiUrl(attachment.url) : null;
  if (attachment.kind === 'image' && src) {
    const image = (
      <img
        src={src}
        alt={attachment.name}
        loading="lazy"
        width={attachment.width ?? undefined}
        height={attachment.height ?? undefined}
        className="h-auto max-h-72 w-auto max-w-full rounded-xl object-contain"
      />
    );
    return attachment.local ? (
      image
    ) : (
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${attachment.name}`}
      >
        {image}
      </a>
    );
  }
  if (attachment.kind === 'video' && src && !attachment.local) {
    return (
      <video
        controls
        preload="metadata"
        src={src}
        aria-label={attachment.name}
        className="max-h-72 max-w-full rounded-xl bg-black"
      />
    );
  }
  if ((attachment.kind === 'audio' || attachment.kind === 'voice') && src && !attachment.local) {
    return (
      <div className="flex min-w-60 flex-col gap-1">
        <span
          className={cn(
            'flex items-center gap-1 text-xs',
            isOwn ? 'text-white/80' : 'text-ink-muted',
          )}
        >
          {attachment.kind === 'voice' ? <Mic aria-hidden="true" className="size-3.5" /> : null}
          {attachment.kind === 'voice' ? 'Voice message' : attachment.name}
        </span>
        <audio
          controls
          preload="metadata"
          src={src}
          aria-label={KIND_LABELS[attachment.kind]}
          className="w-full max-w-72"
        />
      </div>
    );
  }
  return <DocumentCard attachment={attachment} isOwn={isOwn} />;
}

export function StickerView({ id }) {
  const sticker = STICKERS.find((item) => item.id === id);
  return (
    <span
      role="img"
      aria-label={`Sticker: ${sticker?.label ?? 'unknown'}`}
      className="block text-6xl leading-none"
    >
      {sticker?.emoji ?? '❔'}
    </span>
  );
}

/** Reaction counts under a message; your own is highlighted and toggles off when pressed. */
export function ReactionChips({ reactions, selfId, onToggle, align }) {
  if (reactions.length === 0) return null;
  const groups = new Map();
  for (const reaction of reactions) {
    const group = groups.get(reaction.emoji) ?? { emoji: reaction.emoji, count: 0, mine: false };
    group.count += 1;
    if (reaction.userId === selfId) group.mine = true;
    groups.set(reaction.emoji, group);
  }
  return (
    <div className={cn('mt-1 flex flex-wrap gap-1', align === 'end' && 'justify-end')}>
      {[...groups.values()].map((group) => (
        <button
          key={group.emoji}
          type="button"
          disabled={!onToggle}
          aria-pressed={group.mine}
          aria-label={`${group.emoji} ${group.count}${group.mine ? ', including you. Remove your reaction' : ''}`}
          onClick={() => onToggle?.(group.emoji)}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
            group.mine
              ? 'border-primary-300 bg-primary-50 text-primary-800'
              : 'border-border bg-surface text-ink',
          )}
        >
          <span aria-hidden="true">{group.emoji}</span>
          <span aria-hidden="true">{group.count}</span>
        </button>
      ))}
    </div>
  );
}

/** A small "add reaction" button that opens the fixed emoji set. Escape closes it. */
export function ReactionPicker({ emoji, onPick, label = 'Add reaction' }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    containerRef.current?.querySelector('[data-emoji]')?.focus();
    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="relative"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex size-7 items-center justify-center rounded-full text-ink-muted hover:bg-surface-muted hover:text-ink"
      >
        <SmilePlus aria-hidden="true" className="size-4" />
      </button>
      {open ? (
        <div
          role="group"
          aria-label="Reactions"
          className="absolute bottom-full z-20 mb-1 flex gap-0.5 rounded-full border border-border bg-surface p-1 shadow-lg"
        >
          {emoji.map((item) => (
            <button
              key={item}
              type="button"
              data-emoji
              aria-label={`React with ${item}`}
              onClick={() => {
                setOpen(false);
                onPick(item);
              }}
              className="inline-flex size-8 items-center justify-center rounded-full text-lg hover:bg-surface-muted"
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
