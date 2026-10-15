import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { cn } from '../../lib/cn';

const VIEWPORT_MARGIN = 8;
const TRIGGER_GAP = 4;

/**
 * Where a `strategy="fixed"` menu goes: next to its trigger, flipped above when there's more room
 * there, and clamped to the viewport.
 */
function fixedMenuPosition(trigger, menu, { align, side }) {
  const { innerWidth: viewportWidth, innerHeight: viewportHeight } = window;
  const spaceBelow = viewportHeight - trigger.bottom - TRIGGER_GAP - VIEWPORT_MARGIN;
  const spaceAbove = trigger.top - TRIGGER_GAP - VIEWPORT_MARGIN;
  const fitsPreferred = side === 'top' ? spaceAbove >= menu.height : spaceBelow >= menu.height;
  const above = fitsPreferred ? side === 'top' : spaceAbove > spaceBelow;
  const top = above ? trigger.top - TRIGGER_GAP - menu.height : trigger.bottom + TRIGGER_GAP;
  const left = align === 'end' ? trigger.right - menu.width : trigger.left;
  return {
    top: Math.max(VIEWPORT_MARGIN, Math.min(top, viewportHeight - VIEWPORT_MARGIN - menu.height)),
    left: Math.max(VIEWPORT_MARGIN, Math.min(left, viewportWidth - VIEWPORT_MARGIN - menu.width)),
  };
}

/**
 * Menu button following the WAI-ARIA APG menu pattern (arrow keys, Home/End, Escape, Tab).
 * `strategy="fixed"` positions the menu against the viewport, for triggers inside scrolling or
 * stacked rows (e.g. the chat list) that would otherwise clip or cover it.
 */
export function DropdownMenu({
  label,
  trigger,
  triggerClassName,
  items,
  align = 'end',
  side = 'bottom',
  strategy = 'absolute',
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const fixed = strategy === 'fixed';
  const menuId = useId();
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const containerRef = useRef(null);
  const pendingFocus = useRef('first');
  const navigate = useNavigate();

  const getItems = useCallback(
    () =>
      Array.from(
        menuRef.current?.querySelectorAll('[role="menuitem"]:not([aria-disabled="true"])') ?? [],
      ),
    [],
  );

  const close = useCallback((restoreFocus) => {
    setOpen(false);
    setPosition(null);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  // Fixed menus are placed before paint; scrolling the page or list underneath closes them.
  useLayoutEffect(() => {
    if (!open || !fixed) return;
    const place = () => {
      if (!triggerRef.current || !menuRef.current) return;
      setPosition(
        fixedMenuPosition(
          triggerRef.current.getBoundingClientRect(),
          menuRef.current.getBoundingClientRect(),
          { align, side },
        ),
      );
    };
    const onScroll = (event) => {
      if (!(event.target instanceof Node && menuRef.current?.contains(event.target))) close(false);
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, fixed, align, side, close]);

  const openMenu = (focus) => {
    pendingFocus.current = focus;
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const menuItems = getItems();
    (pendingFocus.current === 'first' ? menuItems[0] : menuItems.at(-1))?.focus();

    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) close(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, getItems, close]);

  const onTriggerKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openMenu('first');
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openMenu('last');
    }
  };

  const onMenuKeyDown = (event) => {
    const menuItems = getItems();
    const index = menuItems.indexOf(document.activeElement);
    const focusAt = (next) => {
      menuItems[(next + menuItems.length) % menuItems.length]?.focus();
    };
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusAt(index + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusAt(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusAt(0);
        break;
      case 'End':
        event.preventDefault();
        focusAt(menuItems.length - 1);
        break;
      case 'Escape':
        event.preventDefault();
        close(true);
        break;
      case 'Tab':
        close(false);
        break;
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close(false) : openMenu('first'))}
        onKeyDown={onTriggerKeyDown}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          style={fixed ? (position ?? { top: 0, left: 0, opacity: 0 }) : undefined}
          className={cn(
            'min-w-56 rounded-xl border border-border bg-surface p-1 shadow-lg',
            fixed
              ? 'fixed z-50 max-h-[calc(100dvh-1rem)] max-w-[calc(100vw-1rem)] overflow-y-auto'
              : 'absolute z-30',
            !fixed && (align === 'end' ? 'right-0' : 'left-0'),
            !fixed && (side === 'bottom' ? 'top-full mt-1' : 'bottom-full mb-1'),
          )}
        >
          {items.map((entry, index) => {
            if (entry.type === 'separator') {
              return <div key={index} role="separator" className="my-1 h-px bg-border" />;
            }
            if (entry.type === 'label') {
              return (
                <div key={index} role="presentation" className="px-3 py-2 text-xs text-ink-muted">
                  {entry.label}
                </div>
              );
            }
            const Icon = entry.icon;
            return (
              <button
                key={index}
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-disabled={entry.disabled ? true : undefined}
                onClick={() => {
                  if (entry.disabled) return;
                  close(true);
                  entry.onSelect?.();
                  if (entry.href) void navigate(entry.href);
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm outline-none focus-visible:bg-primary-50 focus-visible:outline-none',
                  entry.disabled
                    ? 'cursor-not-allowed text-ink-subtle'
                    : entry.tone === 'danger'
                      ? 'text-danger-700 hover:bg-danger-50 focus:bg-danger-50'
                      : 'text-ink hover:bg-surface-muted focus:bg-primary-50',
                )}
              >
                {Icon ? <Icon aria-hidden="true" className="size-4 shrink-0" /> : null}
                <span className="flex-1">{entry.label}</span>
                {entry.hint ? <span className="text-xs text-ink-subtle">{entry.hint}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
