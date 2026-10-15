import { NavLink } from 'react-router';
import { cn } from '../../lib/cn';
import { BrandMark } from './BrandMark';
import { NavBadge } from './NavBadge';
import { primaryNavItems } from './nav-items';
import { UserMenu } from './UserMenu';

/** Mobile-only top bar with brand and account menu. */
export function MobileTopBar() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-4 md:hidden">
      <BrandMark />
      <UserMenu />
    </header>
  );
}

/** Mobile-only bottom tab bar for the primary destinations. */
export function BottomNav() {
  return (
    <nav
      aria-label="Main"
      className="shrink-0 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-5">
        {primaryNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex h-16 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium',
                    isActive ? 'text-primary-700' : 'text-ink-muted hover:text-ink',
                  )
                }
              >
                <span className="relative">
                  <Icon aria-hidden="true" className="size-5" />
                  {item.badge ? (
                    <span className="absolute -top-2 -right-3">
                      <NavBadge kind={item.badge} />
                    </span>
                  ) : null}
                </span>
                {item.label}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
