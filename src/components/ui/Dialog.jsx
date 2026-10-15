import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { cn } from '../../lib/cn';
import { IconButton } from './Button';

const widths = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' };

/**
 * Modal dialog built on the native <dialog> element, which provides the focus trap,
 * inert background, top-layer rendering and Escape handling. Focus returns to the
 * previously focused element when it closes.
 */
export function Dialog({ open, onClose, title, description, children, footer, size = 'md' }) {
  const ref = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    // Prefer the element marked data-autofocus (usually the first field) over the close button.
    dialog.querySelector('[data-autofocus]')?.focus();
    return () => {
      if (dialog.open) dialog.close();
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click on the ::backdrop targets the <dialog> element itself.
        if (event.target === event.currentTarget) onClose();
      }}
      className={cn(
        'm-auto w-[calc(100%-2rem)] max-w-none rounded-xl border border-border bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/40',
        widths[size],
      )}
    >
      <div className="flex items-start justify-between gap-4 px-5 pt-5">
        <div className="min-w-0">
          <h2 id={titleId} className="text-lg font-semibold text-ink">
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="mt-1 text-sm text-ink-muted">
              {description}
            </p>
          ) : null}
        </div>
        <IconButton
          label="Close dialog"
          icon={X}
          size="sm"
          onClick={onClose}
          className="-mt-1 -mr-1"
        />
      </div>
      {children ? <div className="px-5 pt-4">{children}</div> : null}
      <div className="flex flex-col-reverse gap-2 px-5 pt-5 pb-5 sm:flex-row sm:justify-end">
        {footer}
      </div>
    </dialog>
  );
}
