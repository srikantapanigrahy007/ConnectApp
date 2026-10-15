import { isAdminRole } from '#shared';
import {
  Ban,
  ChevronsUpDown,
  CircleUserRound,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import { useLogout, useSession } from '../../features/auth/hooks';
import { cn } from '../../lib/cn';
import { Avatar } from '../ui/Avatar';
import { DropdownMenu } from '../ui/DropdownMenu';

export function UserMenu({ variant = 'compact', side = 'bottom', align = 'end' }) {
  const session = useSession();
  const logout = useLogout();
  if (session.status !== 'authenticated') return null;
  const { user } = session;

  const items = [
    { type: 'label', label: <span className="block truncate">Signed in as @{user.username}</span> },
    { label: 'Profile', icon: CircleUserRound, href: '/profile' },
    { label: 'Settings', icon: Settings, href: '/settings' },
    { label: 'Privacy & security', icon: ShieldCheck, href: '/settings/privacy' },
    { label: 'Blocked users', icon: Ban, href: '/settings/blocked' },
    // Shown to administrators only; the admin API itself checks the role server-side.
    ...(isAdminRole(user.role) ? [{ label: 'Admin', icon: LayoutDashboard, href: '/admin' }] : []),
    { type: 'separator' },
    {
      label: 'Sign out',
      icon: LogOut,
      // The session watcher clears the session; protected screens then redirect to sign-in.
      onSelect: () => logout.mutate(),
    },
  ];

  return (
    <DropdownMenu
      label="Account menu"
      items={items}
      side={side}
      align={align}
      triggerClassName={cn(
        'flex items-center gap-3 rounded-lg text-left hover:bg-surface-muted',
        variant === 'full' ? 'w-full p-2' : 'p-1',
      )}
      trigger={
        <>
          <Avatar name={user.displayName} src={user.avatarUrl ?? undefined} size="sm" decorative />
          {variant === 'full' ? (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">
                  {user.displayName}
                </span>
                <span className="block truncate text-xs text-ink-muted">@{user.username}</span>
              </span>
              <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
            </>
          ) : null}
        </>
      }
    />
  );
}
