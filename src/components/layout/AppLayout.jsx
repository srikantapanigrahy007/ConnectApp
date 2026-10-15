import { useEffect, useRef } from 'react';
import { Outlet, useLocation, useMatch } from 'react-router';
import { EmailVerificationBanner } from '../../features/auth/components/EmailVerificationBanner';
import { CallManager } from '../../features/calls/components/CallManager';
import { E2EELifecycle } from '../../features/e2ee/E2EELifecycle';
import { MessagingRealtime } from '../../features/messaging/components/MessagingRealtime';
import { NotificationsRealtime } from '../../features/notifications/components/NotificationsRealtime';
import { MaintenanceBanner } from '../../features/platform/MaintenanceBanner';
import { cn } from '../../lib/cn';
import { BottomNav, MobileTopBar } from './MobileNav';
import { Sidebar } from './Sidebar';
import { SkipLink } from './SkipLink';

/**
 * Signed-in application shell. Each region scrolls independently so messaging panes can
 * keep their own scroll position; the window itself never scrolls.
 */
export function AppLayout() {
  const { pathname } = useLocation();
  const mainRef = useRef(null);
  // An open conversation uses the full mobile screen for messages and the composer.
  const inConversation = useMatch('/chats/:conversationId') !== null;
  // Messaging and settings panes scroll themselves; <main> must never scroll there, or their
  // headers and sidebars move when a pane reaches its end (or content is scrolled into view).
  const inMessaging = useMatch('/chats/*') !== null;
  const inSettings = useMatch('/settings/*') !== null;
  const panesScrollThemselves = inMessaging || inSettings;

  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [pathname]);

  return (
    // `relative` makes this the containing block of absolutely positioned descendants (e.g.
    // sr-only labels deep in a long message list), so overflow-hidden clips them instead of
    // letting them stretch the document and give the window its own scrollbar.
    <div className="relative flex h-dvh overflow-hidden">
      <SkipLink />
      <MessagingRealtime />
      <NotificationsRealtime />
      <CallManager />
      <E2EELifecycle />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {inConversation ? null : <MobileTopBar />}
        <MaintenanceBanner />
        <EmailVerificationBanner />
        <main
          id="main"
          ref={mainRef}
          tabIndex={-1}
          className={cn(
            'min-h-0 flex-1 overscroll-contain focus:outline-none',
            panesScrollThemselves ? 'overflow-clip' : 'overflow-y-auto',
          )}
        >
          <Outlet />
        </main>
        {inConversation ? null : <BottomNav />}
      </div>
    </div>
  );
}
