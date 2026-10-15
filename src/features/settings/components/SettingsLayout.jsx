import { Ban, Bell, Menu, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { PageContainer } from '../../../components/layout/Page';
import { NavDrawer, SideNavList } from '../../../components/layout/SideNav';
import { IconButton } from '../../../components/ui/Button';

const sections = [
  { to: '/settings', label: 'General', icon: SlidersHorizontal, end: true },
  { to: '/settings/notifications', label: 'Notifications', icon: Bell, end: false },
  { to: '/settings/privacy', label: 'Privacy & security', icon: ShieldCheck, end: false },
  { to: '/settings/blocked', label: 'Blocked users', icon: Ban, end: false },
];

function currentSection(pathname) {
  return (
    sections.find(({ to, end }) => (end ? pathname === to : pathname.startsWith(to))) ?? sections[0]
  );
}

/**
 * Settings shell, inside the app shell. Tablet and desktop: a fixed section sidebar beside the
 * content, which scrolls on its own. Mobile: a bar naming the current section opens the
 * sections in a slide-in drawer.
 */
export function SettingsLayout() {
  const { pathname } = useLocation();
  const contentRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [pathname]);

  return (
    <div className="flex h-full">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-surface md:flex lg:w-60">
        <p className="flex h-16 shrink-0 items-center px-5 text-xs font-semibold tracking-wide text-ink-muted uppercase">
          Settings
        </p>
        <div className="min-h-0 flex-1 scrollbar-none overflow-y-auto overscroll-contain px-3 pb-3">
          <SideNavList label="Settings" items={sections} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface px-2 md:hidden">
          <IconButton
            label="Open settings menu"
            icon={Menu}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          />
          <span className="truncate text-sm font-medium text-ink">
            <span className="text-ink-muted">Settings · </span>
            {currentSection(pathname).label}
          </span>
        </div>
        <div
          ref={contentRef}
          className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          <PageContainer>
            <Outlet />
          </PageContainer>
        </div>
      </div>

      <NavDrawer
        open={menuOpen}
        onClose={closeMenu}
        label="Settings menu"
        header={<span className="font-semibold text-ink">Settings</span>}
      >
        <SideNavList label="Settings" items={sections} onNavigate={closeMenu} />
      </NavDrawer>
    </div>
  );
}
