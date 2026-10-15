import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clearSessionEndReason, emitSessionEnded } from '../../lib/session-events';
import * as authApi from './api';

export const sessionQueryKey = ['auth', 'session'];

/**
 * The current session, loaded from GET /auth/session and shared by every component.
 *
 * - `status: 'loading'`: still checking with the server.
 * - `status: 'anonymous'`: not signed in (`user` and `session` are null).
 * - `status: 'authenticated'`: `user` is an AuthUser and `session` the session info
 *   (see authSessionSchema in #shared).
 *
 * @returns {{ status: 'loading' | 'anonymous' | 'authenticated', user: object | null, session: object | null, error: Error | null }}
 */
export function useSession() {
  const query = useQuery({
    queryKey: sessionQueryKey,
    queryFn: authApi.getSession,
    staleTime: 60_000,
    retry: false,
  });
  if (query.isPending) return { status: 'loading', user: null, session: null, error: null };
  if (!query.data) return { status: 'anonymous', user: null, session: null, error: query.error };
  return {
    status: 'authenticated',
    user: query.data.user,
    session: query.data.session,
    error: null,
  };
}

export function useAuthProviders() {
  return useQuery({
    queryKey: ['auth', 'providers'],
    queryFn: authApi.getProviders,
    staleTime: 5 * 60_000,
  });
}

// Mutation functions are wrapped so TanStack Query's extra context argument never reaches the API.

/** Stores a freshly issued session so every consumer updates immediately. */
function useSetSession() {
  const queryClient = useQueryClient();
  return (session) => {
    if (session) clearSessionEndReason();
    queryClient.setQueryData(sessionQueryKey, session);
  };
}

/** Clears everything cached for the previous user. */
export function useClearSession() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
    queryClient.setQueryData(sessionQueryKey, null);
  };
}

export function useLogin() {
  const setSession = useSetSession();
  return useMutation({
    mutationFn: (input) => authApi.login(input),
    onSuccess: setSession,
  });
}

export function useRegister() {
  const setSession = useSetSession();
  return useMutation({
    mutationFn: (input) => authApi.register(input),
    onSuccess: setSession,
  });
}

/** Signs out; the session watcher clears cached data and shows the notice. */
export function useLogout() {
  return useMutation({
    mutationFn: () => authApi.logout(),
    onSettled: () => emitSessionEnded('logged_out'),
  });
}

export function useLogoutAll() {
  return useMutation({
    mutationFn: () => authApi.logoutAll(),
    onSuccess: () => emitSessionEnded('logged_out'),
  });
}

export function useChangePassword() {
  const setSession = useSetSession();
  return useMutation({
    mutationFn: (input) => authApi.changePassword(input),
    onSuccess: setSession,
  });
}

export function useReauthenticate() {
  const setSession = useSetSession();
  return useMutation({
    mutationFn: (password) => authApi.reauthenticate(password),
    onSuccess: setSession,
  });
}

export function useDeleteAccount() {
  const clear = useClearSession();
  return useMutation({ mutationFn: () => authApi.deleteAccount(), onSuccess: clear });
}

export function useResendVerification() {
  return useMutation({ mutationFn: () => authApi.resendVerification() });
}

export function useVerifyEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token) => authApi.verifyEmail(token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionQueryKey }),
  });
}

export function useRequestPasswordReset() {
  return useMutation({ mutationFn: (email) => authApi.requestPasswordReset(email) });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: ({ token, password }) => authApi.resetPassword(token, password),
  });
}

/** True when the last proof of identity is recent enough for sensitive changes (5 minutes). */
export function isRecentlyAuthenticated(session, maxAgeMs = 5 * 60_000) {
  return Date.now() - new Date(session.authenticatedAt).getTime() < maxAgeMs;
}
