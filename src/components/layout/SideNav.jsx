import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router';
import { IconButton } from '../ui/Button';
import { sideNavRowClasses } from './side-nav-styles';

/** Row label that becomes screen-reader-only on the tablet icon rail. */
export function SideNavLabel({ rail, children }) {
  return <span className={rail ? 'sr-only lg:not-sr-only' : undefined}>{children}</span>;
}

/** A labelled <nav> of icon + label links; `onNavigate` runs on every click (closes a drawer). */
export function SideNavList({ label, items, rail = false, onNavigate }) {
  return (
    <nav aria-label={label}>
      <ul className="space-y-1">
        {items.map(({ to, label: itemLabel, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              title={rail ? itemLabel : undefined}
              onClick={onNavigate}
              className={({ isActive }) => sideNavRowClasses(rail, isActive)}
            >
              <Icon aria-hidden="true" className="size-5 shrink-0" />
              <SideNavLabel rail={rail}>{itemLabel}</SideNavLabel>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Mobile navigation drawer that slides in from the left. The native <dialog> provides the focus
 * trap, inert background and Escape handling; focus returns to the button that opened it.
 */
export function NavDrawer({ open, onClose, label, header, footer, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click on the ::backdrop targets the <dialog> element itself.
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-0 h-dvh max-h-none w-72 max-w-[85vw] border-r border-border bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/40 md:hidden"
    >
      <div className="flex h-full flex-col">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
          {header}
          <IconButton label="Close menu" icon={X} size="sm" onClick={onClose} className="ml-auto" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
