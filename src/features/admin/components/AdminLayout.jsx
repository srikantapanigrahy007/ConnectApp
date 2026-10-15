import { adminRoleOf, APP_NAME } from '#shared';
import {
  ArrowLeft,
  Flag,
  LayoutDashboard,
  Menu,
  ScrollText,
  Server,
  Settings,
  UserCog,
  Users,
  UsersRound,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { BrandMark } from '../../../components/layout/BrandMark';
import { NavDrawer, SideNavLabel, SideNavList } from '../../../components/layout/SideNav';
import { sideNavRowClasses } from '../../../components/layout/side-nav-styles';
import { SkipLink } from '../../../components/layout/SkipLink';
import { UserMenu } from '../../../components/layout/UserMenu';
import { Badge } from '../../../components/ui/Badge';
import { IconButton } from '../../../components/ui/Button';
import { useSession } from '../../auth/hooks';
import { MaintenanceBanner } from '../../platform/MaintenanceBanner';
import { useCan } from '../hooks';
import { ROLE_LABELS } from '../labels';

/** Each section appears only for roles holding its permission (the API checks it too). */
const ADMIN_NAV = [
  {
    to: '/admin',
    label: 'Overview',
    icon: LayoutDashboard,
    end: true,
    permission: 'dashboard.view',
  },
  { to: '/admin/users', label: 'Users', icon: Users, permission: 'users.view' },
  { to: '/admin/groups', label: 'Groups', icon: UsersRound, permission: 'groups.view' },
  { to: '/admin/reports', label: 'Reports', icon: Flag, permission: 'reports.view' },
  { to: '/admin/roles', label: 'Roles', icon: UserCog, permission: 'roles.manage' },
  { to: '/admin/audit', label: 'Audit log', icon: ScrollText, permission: 'audit.view' },
  { to: '/admin/settings', label: 'Settings', icon: Settings, permission: 'settings.manage' },
  { to: '/admin/system', label: 'System', icon: Server, permission: 'system.view' },
];

function BackToAppLink({ rail = false, onNavigate }) {
  return (
    <Link
      to="/chats"
      title={rail ? `Back to ${APP_NAME}` : undefined}
      onClick={onNavigate}
      className={sideNavRowClasses(rail)}
    >
      <ArrowLeft aria-hidden="true" className="size-5 shrink-0" />
      <SideNavLabel rail={rail}>Back to {APP_NAME}</SideNavLabel>
    </Link>
  );
}

/** Tablet: 72px icon rail. Desktop: 240px sidebar with labels. Hidden on mobile. */
function AdminSidebar({ items, roleLabel }) {
  return (
    <aside className="hidden w-[4.5rem] shrink-0 flex-col border-r border-border bg-surface md:flex lg:w-60">
      <div className="flex h-16 shrink-0 items-center gap-2 px-4 md:justify-center lg:justify-start lg:px-5">
        <span className="lg:hidden">
          <BrandMark showName={false} />
        </span>
        <span className="hidden lg:inline">
          <BrandMark />
        </span>
        <span className="ml-auto hidden lg:inline-flex">
          <Badge tone="primary">{roleLabel}</Badge>
        </span>
      </div>
      <div className="min-h-0 flex-1 scrollbar-none overflow-y-auto overscroll-contain px-3 pb-3">
        <SideNavList label="Admin" items={items} rail />
      </div>
      <div className="shrink-0 space-y-1 border-t border-border p-3">
        <BackToAppLink rail />
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

/**
 * Admin shell at /admin, guarded by RequireAdmin (any admin role). Hiding sections is only for
 * clarity: every admin API checks the caller's permission on the server. Like the app shell,
 * the window never scrolls: the sidebar stays put and only <main> scrolls.
 */
export function AdminLayout() {
  const can = useCan();
  const session = useSession();
  const { pathname } = useLocation();
  const mainRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const adminNav = ADMIN_NAV.filter((item) => can(item.permission));
  const roleLabel = ROLE_LABELS[adminRoleOf(session.user?.role)] ?? 'Admin';

  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [pathname]);

  return (
    // `relative` + overflow-hidden keep absolutely positioned descendants from stretching the
    // document (see AppLayout).
    <div className="relative flex h-dvh overflow-hidden">
      <SkipLink />
      <AdminSidebar items={adminNav} roleLabel={roleLabel} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-2 md:hidden">
          <IconButton
            label="Open admin menu"
            icon={Menu}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          />
          {/* The role badge is in the drawer, so it appears only once on the page. */}
          <BrandMark />
          <span className="ml-auto">
            <UserMenu />
          </span>
        </header>
        <MaintenanceBanner />
        <main
          id="main"
          ref={mainRef}
          tabIndex={-1}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain focus:outline-none"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
            <Outlet />
          </div>
        </main>
      </div>
      <NavDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        label="Admin menu"
        header={
          <>
            <BrandMark />
            <Badge tone="primary">{roleLabel}</Badge>
          </>
        }
        footer={<BackToAppLink onNavigate={() => setMenuOpen(false)} />}
      >
        <SideNavList label="Admin" items={adminNav} onNavigate={() => setMenuOpen(false)} />
      </NavDrawer>
    </div>
  );
}
