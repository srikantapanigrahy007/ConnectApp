import { NavLink } from 'react-router';
import { NotificationBell } from '../../features/notifications/components/NotificationBell';
import { cn } from '../../lib/cn';
import { BrandMark } from './BrandMark';
import { NavBadge } from './NavBadge';
import { accountNavItems, primaryNavItems } from './nav-items';
import { UserMenu } from './UserMenu';

function SidebarLink({ item }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      title={item.label}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-lg p-2.5 text-sm font-medium md:justify-center lg:justify-start lg:px-3',
          isActive
            ? 'bg-primary-50 text-primary-700'
            : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
        )
      }
    >
      <span className="relative">
        <Icon aria-hidden="true" className="size-5 shrink-0" />
        {item.badge ? (
          <span className="absolute -top-2 -right-2.5 lg:hidden">
            <NavBadge kind={item.badge} />
          </span>
        ) : null}
      </span>
      {/* Icon-only rail on tablet; the label stays available to screen readers. */}
      <span className="sr-only lg:not-sr-only lg:flex-1">{item.label}</span>
      {item.badge ? (
        <span className="hidden lg:inline-flex">
          <NavBadge kind={item.badge} />
        </span>
      ) : null}
    </NavLink>
  );
}

/** Tablet: 72px icon rail. Desktop: 240px sidebar with labels. Hidden on mobile. */
export function Sidebar() {
  return (
    <aside className="hidden w-[4.5rem] shrink-0 flex-col border-r border-border bg-surface md:flex lg:w-60">
      <div className="flex h-16 items-center px-4 md:justify-center lg:justify-start lg:px-5">
        <span className="lg:hidden">
          <BrandMark showName={false} />
        </span>
        <span className="hidden lg:inline">
          <BrandMark />
        </span>
        {/* Desktop: the bell opens the latest notifications in place. */}
        <span className="ml-auto hidden lg:block">
          <NotificationBell />
        </span>
      </div>
      <nav aria-label="Main" className="flex flex-1 flex-col justify-between gap-4 px-3 pb-3">
        <ul className="space-y-1">
          {primaryNavItems.map((item) => (
            <li key={item.to}>
              <SidebarLink item={item} />
            </li>
          ))}
        </ul>
        <ul className="space-y-1">
          {accountNavItems.map((item) => (
            <li key={item.to}>
              <SidebarLink item={item} />
            </li>
          ))}
        </ul>
      </nav>
      <div className="border-t border-border p-3">
        <div className="hidden lg:block">
          <UserMenu variant="full" side="top" align="start" />
        </div>
        <div className="flex justify-center lg:hidden">
          <UserMenu variant="compact" side="top" align="start" />
        </div>
      </div>
    </aside>
  );
}
