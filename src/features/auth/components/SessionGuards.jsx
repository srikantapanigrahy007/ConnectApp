import { isAdminRole } from '#shared';
import { ShieldX } from 'lucide-react';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router';
import { ButtonLink } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { PageSpinner } from '../../../components/ui/Spinner';
import { useToast } from '../../../components/ui/toast-context';
import { usePageTitle } from '../../../hooks/use-page-title';
import { onSessionEnded, signedOutMessages } from '../../../lib/session-events';
import { sessionQueryKey, useClearSession, useSession } from '../hooks';
import { safeReturnPath } from '../safe-return-path';
import { useSessionSocket } from '../use-session-socket';

/**
 * Root route element: reacts when this session ends (sign-out, or the server revoking it via an
 * API error or the real-time connection) and keeps the authenticated socket open while signed in.
 * Protected screens then redirect to sign-in through RequireAuth, keeping ?returnTo=.
 */
export function SessionWatcher() {
  const session = useSession();
  const clearSession = useClearSession();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useSessionSocket(session.status === 'authenticated' ? session.session.id : null);

  useEffect(
    () =>
      onSessionEnded((reason) => {
        // Already signed out (e.g. a socket notice arriving after an explicit sign-out).
        if (!queryClient.getQueryData(sessionQueryKey)) return;
        clearSession();
        toast({
          tone: reason === 'superseded' ? 'warning' : 'info',
          title: signedOutMessages[reason],
        });
      }),
    [clearSession, queryClient, toast],
  );

  return <Outlet />;
}

/** Protects signed-in screens; remembers where the user was going. */
export function RequireAuth({ children }) {
  const session = useSession();
  const location = useLocation();
  if (session.status === 'loading') return <PageSpinner label="Checking your session…" />;
  if (session.status === 'anonymous') {
    const returnTo = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }
  return children;
}

/** Signed-in users skip the sign-in and sign-up screens (honouring a safe ?returnTo=). */
export function RedirectIfAuthenticated({ children }) {
  const session = useSession();
  const [searchParams] = useSearchParams();
  if (session.status === 'loading') return <PageSpinner label="Checking your session…" />;
  if (session.status === 'authenticated') {
    return <Navigate to={safeReturnPath(searchParams.get('returnTo'))} replace />;
  }
  return children;
}

function AccessDenied() {
  usePageTitle('Access denied');
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center bg-canvas p-4">
      <div>
        <h1 className="sr-only">Access denied</h1>
        <EmptyState
          icon={ShieldX}
          headingLevel={2}
          title="You don't have access to this area"
          description="The admin area is only available to administrators."
          action={<ButtonLink to="/chats">Go to chats</ButtonLink>}
        />
      </div>
    </main>
  );
}

/**
 * Client-side gate for /admin. It only hides the UI: every admin API must also check the role
 * on the server.
 */
export function RequireAdmin({ children }) {
  const session = useSession();
  return (
    <RequireAuth>
      {session.status === 'authenticated' && isAdminRole(session.user.role) ? (
        children
      ) : (
        <AccessDenied />
      )}
    </RequireAuth>
  );
}
