import { ATTACHMENT_EXTENSIONS, ATTACHMENT_MAX_BYTES, LIMITS, STICKERS } from '#shared';
import {
  BarChart3,
  FileText,
  Paperclip,
  Pencil,
  Reply,
  SendHorizontal,
  Sticker,
  X,
} from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { IconButton } from '../../../components/ui/Button';
import { cn } from '../../../lib/cn';
import { usePublicSettings } from '../../platform/hooks';
import { formatFileSize } from '../view-models';
import { VoiceRecorder } from './VoiceRecorder';

const MESSAGE_MAX_LENGTH = LIMITS.messageTextMaxLength;

/** Unsent drafts per conversation, kept while navigating between conversations in this tab. */
const drafts = new Map();

/**
 * Client-side check (the server checks again, including the file's real content). The size
 * limit is the platform setting when known, else the built-in maximum.
 */
function checkFile(file, maxBytes = ATTACHMENT_MAX_BYTES) {
  if (file.size > maxBytes) {
    const limit =
      maxBytes >= 1024 * 1024
        ? `${Number((maxBytes / (1024 * 1024)).toFixed(1))} MB`
        : formatFileSize(maxBytes);
    return `“${file.name}” is larger than ${limit}.`;
  }
  if (file.size === 0) return `“${file.name}” is empty.`;
  const dot = file.name.lastIndexOf('.');
  const extension = dot > 0 ? file.name.slice(dot).toLowerCase() : '';
  if (!ATTACHMENT_EXTENSIONS.includes(extension)) {
    return `“${file.name}” isn't a supported file type.`;
  }
  return null;
}

function StickerPicker({ onPick, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    ref.current?.querySelector('[data-sticker]')?.focus();
    const onPointerDown = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);
  return (
    <div
      ref={ref}
      className="relative"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <IconButton
        label="Stickers"
        icon={Sticker}
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      />
      {open ? (
        <div
          role="group"
          aria-label="Stickers"
          className="absolute bottom-full left-0 z-20 mb-2 grid w-64 grid-cols-4 gap-1 rounded-xl border border-border bg-surface p-2 shadow-lg"
        >
          {STICKERS.map((sticker) => (
            <button
              key={sticker.id}
              type="button"
              data-sticker
              aria-label={`Send sticker: ${sticker.label}`}
              title={sticker.label}
              onClick={() => {
                setOpen(false);
                onPick(sticker.id);
              }}
              className="flex aspect-square items-center justify-center rounded-lg text-3xl hover:bg-surface-muted"
            >
              {sticker.emoji}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ContextBar({ icon: Icon, title, text, onCancel, cancelLabel }) {
  return (
    <div className="flex items-start gap-2 border-t border-border bg-surface-muted px-4 py-2 text-xs">
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary-700" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">{title}</p>
        <p className="truncate text-ink-muted">{text}</p>
      </div>
      <IconButton label={cancelLabel} icon={X} size="sm" onClick={onCancel} />
    </div>
  );
}

/**
 * Message input: Enter sends, Shift+Enter inserts a new line.
 *
 * - `onSend(text)` may return `false` to keep the draft. Otherwise the draft is cleared: the
 *   message is then shown as "sending", and stays there with Retry if it fails, so its text is
 *   never lost.
 * - `onAttach(file, { caption, kind })` sends a file (with the draft as its caption). Files are
 *   checked against the allowlist and the 5 MB limit first.
 * - `onSticker(id)`, `replyTo` + `onCancelReply`, `editing` + `onSaveEdit(text)` (a promise; the
 *   text stays if saving fails) + `onCancelEdit`.
 * - `onTyping()` / `onStopTyping()` drive the typing indicator; `draftKey` keeps one draft per
 *   conversation.
 */
export function MessageComposer({
  onSend,
  onAttach,
  onSticker,
  onCreatePoll,
  onTyping,
  onStopTyping,
  disabledReason,
  draftKey,
  replyTo,
  onCancelReply,
  editing,
  onSaveEdit,
  onCancelEdit,
}) {
  const [value, setValue] = useState(() => (draftKey ? (drafts.get(draftKey) ?? '') : ''));
  const [file, setFile] = useState(null);
  const [problem, setProblem] = useState(null);
  const [saving, setSaving] = useState(false);
  const uploadMaxBytes = usePublicSettings().data?.uploadMaxBytes;
  const inputId = useId();
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const stopTypingRef = useRef(onStopTyping);
  const [savedDraft, setSavedDraft] = useState(null);
  const disabled = !onSend;
  const trimmed = value.trim();
  const tooLong = trimmed.length > MESSAGE_MAX_LENGTH;
  const canSend = !disabled && !tooLong && !saving && (trimmed.length > 0 || Boolean(file));

  useEffect(() => {
    stopTypingRef.current = onStopTyping;
  }, [onStopTyping]);
  useEffect(() => () => stopTypingRef.current?.(), []);

  // Entering edit mode puts the message text in the box (and keeps the draft for afterwards).
  // Adjusted while rendering, as React recommends for state derived from a changed prop.
  const editingId = editing?.id ?? null;
  const [seenEditingId, setSeenEditingId] = useState(editingId);
  if (editingId !== seenEditingId) {
    setSeenEditingId(editingId);
    if (editingId) {
      setSavedDraft(value);
      setValue(editing.text);
    }
  }
  useEffect(() => {
    if (editingId) textareaRef.current?.focus();
  }, [editingId]);
  useEffect(() => {
    if (replyTo) textareaRef.current?.focus();
  }, [replyTo]);

  const rememberDraft = (next) => {
    if (!draftKey || editing) return;
    if (next) drafts.set(draftKey, next);
    else drafts.delete(draftKey);
  };

  const update = (next) => {
    setValue(next);
    rememberDraft(next);
    if (editing) return;
    if (next.trim()) onTyping?.();
    else onStopTyping?.();
  };

  const clear = () => {
    setValue('');
    rememberDraft('');
    setFile(null);
    setProblem(null);
  };

  const finishEditing = () => {
    setValue(savedDraft ?? '');
    setSavedDraft(null);
    onCancelEdit?.();
  };

  const send = async () => {
    if (!canSend) return;
    if (editing) {
      if (!trimmed) return;
      setSaving(true);
      try {
        await onSaveEdit(trimmed);
        finishEditing();
      } catch {
        // Keep the edited text; the screen shows why it failed.
      } finally {
        setSaving(false);
      }
      return;
    }
    if (file) {
      onAttach?.(file, { caption: trimmed || undefined });
      clear();
    } else {
      const kept = onSend(trimmed) === false;
      if (!kept) clear();
    }
    onStopTyping?.();
  };

  const onPickFile = (event) => {
    const picked = event.target.files?.[0];
    event.target.value = '';
    if (!picked) return;
    const error = checkFile(picked, uploadMaxBytes);
    setProblem(error);
    setFile(error ? null : picked);
  };

  return (
    <div className="shrink-0">
      {editing ? (
        <ContextBar
          icon={Pencil}
          title="Editing message"
          text={editing.text}
          cancelLabel="Cancel editing"
          onCancel={finishEditing}
        />
      ) : replyTo ? (
        <ContextBar
          icon={Reply}
          title={`Replying to ${replyTo.authorName}`}
          text={replyTo.preview}
          cancelLabel="Cancel reply"
          onCancel={onCancelReply}
        />
      ) : null}
      {file ? (
        <div className="flex items-center gap-2 border-t border-border bg-surface-muted px-4 py-2 text-xs">
          <FileText aria-hidden="true" className="size-4 shrink-0 text-primary-700" />
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium text-ink">{file.name}</span>{' '}
            <span className="text-ink-muted">
              · {formatFileSize(file.size)} · add a caption or send
            </span>
          </span>
          <IconButton label="Remove attachment" icon={X} size="sm" onClick={() => setFile(null)} />
        </div>
      ) : null}
      {problem ? (
        <p
          role="alert"
          className="border-t border-border bg-danger-50 px-4 py-2 text-xs text-danger-700"
        >
          {problem}
        </p>
      ) : null}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
        className="flex items-end gap-1 border-t border-border bg-surface px-3 py-3 sm:gap-2 sm:px-4"
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
          accept={ATTACHMENT_EXTENSIONS.join(',')}
          onChange={onPickFile}
        />
        <IconButton
          label={onAttach ? 'Attach a file (up to 5 MB)' : "Attachments aren't available"}
          icon={Paperclip}
          disabled={disabled || !onAttach || Boolean(editing)}
          onClick={() => fileInputRef.current?.click()}
        />
        {onSticker ? (
          <StickerPicker
            disabled={disabled || Boolean(editing)}
            onPick={(id) => {
              onSticker(id);
              setProblem(null);
            }}
          />
        ) : null}
        {onCreatePoll ? (
          <IconButton
            label="Create a poll"
            icon={BarChart3}
            disabled={disabled || Boolean(editing)}
            onClick={onCreatePoll}
          />
        ) : null}
        <label htmlFor={inputId} className="sr-only">
          {editing ? 'Edit message' : 'Message'}
        </label>
        <textarea
          id={inputId}
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(event) => update(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send();
            } else if (event.key === 'Escape' && editing) {
              event.preventDefault();
              finishEditing();
            }
          }}
          onBlur={() => onStopTyping?.()}
          disabled={disabled}
          maxLength={MESSAGE_MAX_LENGTH}
          placeholder={
            disabled
              ? (disabledReason ?? 'Messaging is unavailable')
              : file
                ? 'Add a caption…'
                : 'Write a message…'
          }
          className={cn(
            'max-h-40 min-h-10 min-w-0 flex-1 resize-none rounded-xl border border-border-strong bg-surface px-3.5 py-2 text-sm text-ink placeholder:text-ink-subtle',
            'field-sizing-content focus-visible:border-primary-600 disabled:cursor-not-allowed disabled:bg-surface-muted',
          )}
        />
        {onAttach && !editing && !trimmed && !file ? (
          <VoiceRecorder
            disabled={disabled}
            onRecorded={(recorded) => onAttach(recorded, { kind: 'voice' })}
            onError={setProblem}
          />
        ) : (
          <IconButton
            type="submit"
            label={editing ? 'Save edit' : 'Send message'}
            icon={SendHorizontal}
            variant="primary"
            disabled={!canSend}
          />
        )}
      </form>
    </div>
  );
}
