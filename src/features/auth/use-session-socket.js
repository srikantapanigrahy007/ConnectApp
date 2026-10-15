import { SESSION_SOCKET_EVENTS } from '#shared';
import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL } from '../../config/env';
import { refreshSession } from '../../lib/api-client';
import { setConnectionState, setRealtimeSocket } from '../../lib/realtime-socket';
import { emitSessionEnded, sessionEndReasonFor } from '../../lib/session-events';

/** Handshake errors that a session refresh can fix (the access cookie expired meanwhile). */
const REFRESHABLE = new Set(['ACCESS_TOKEN_EXPIRED', 'UNAUTHORIZED']);
const MAX_REFRESH_DELAY_MS = 30_000;

/**
 * Keeps an authenticated Socket.IO connection open while signed in. The browser sends the
 * HttpOnly access cookie with the handshake; the server checks it and the Origin, and closes the
 * socket the moment this session is revoked (for example by a sign-in on another device).
 *
 * Network drops reconnect automatically. When a reconnect is refused because the short-lived
 * access token expired, the session is refreshed over HTTP and the socket connects again.
 */
export function useSessionSocket(sessionId) {
  useEffect(() => {
    if (!sessionId) return;
    const socket = io(SOCKET_URL, { withCredentials: true, transports: ['websocket'] });
    let stopped = false;
    let retryTimer;
    let refreshAttempts = 0;

    setConnectionState('connecting');
    setRealtimeSocket(socket);

    socket.on('connect', () => {
      refreshAttempts = 0;
      setConnectionState('connected');
    });
    socket.on('disconnect', () => {
      if (!stopped) setConnectionState('reconnecting');
    });
    socket.on(SESSION_SOCKET_EVENTS.revoked, (payload) => {
      emitSessionEnded(payload.reason === 'superseded' ? 'superseded' : 'revoked');
    });
    socket.on('connect_error', (error) => {
      const reason = sessionEndReasonFor(error.message);
      if (reason) {
        emitSessionEnded(reason);
        return;
      }
      setConnectionState('reconnecting');
      // A refusal by the server's auth check is not retried by Socket.IO itself.
      if (socket.active || !REFRESHABLE.has(error.message) || stopped) return;
      const delay = Math.min(1_000 * 2 ** refreshAttempts, MAX_REFRESH_DELAY_MS);
      refreshAttempts += 1;
      retryTimer = setTimeout(() => {
        refreshSession()
          .catch(() => undefined)
          .finally(() => {
            if (!stopped) socket.connect();
          });
      }, delay);
    });

    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      setRealtimeSocket(null);
      setConnectionState('offline');
      socket.disconnect();
    };
  }, [sessionId]);
}
