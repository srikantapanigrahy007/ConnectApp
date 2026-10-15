/**
 * Signals that the server ended this browser's session (signed in elsewhere, revoked, expired).
 * The API client and the real-time connection publish; the auth provider reacts.
 *
 * @typedef {'superseded' | 'revoked' | 'expired' | 'logged_out'} SessionEndReason
 */

const target = new EventTarget();
const EVENT = 'session-ended';
let lastReason = null;

export function emitSessionEnded(reason) {
  lastReason = reason;
  target.dispatchEvent(new CustomEvent(EVENT, { detail: reason }));
}

export function onSessionEnded(listener) {
  const handler = (event) => {
    listener(event.detail);
  };
  target.addEventListener(EVENT, handler);
  return () => target.removeEventListener(EVENT, handler);
}

/** Why the previous session ended, for the sign-in page; cleared by the next sign-in. */
export function lastSessionEndReason() {
  return lastReason;
}

export function clearSessionEndReason() {
  lastReason = null;
}

/** Maps API error codes to why the session ended. */
export function sessionEndReasonFor(code) {
  switch (code) {
    case 'SESSION_SUPERSEDED':
      return 'superseded';
    case 'SESSION_REVOKED':
    case 'REFRESH_TOKEN_REUSED':
      return 'revoked';
    case 'SESSION_INVALID':
      return 'expired';
    default:
      return null;
  }
}

export const signedOutMessages = {
  superseded: 'You were signed out because your account signed in on another device.',
  revoked: 'You have been signed out. Please sign in again.',
  expired: 'Your session expired. Please sign in again.',
  logged_out: 'You have been signed out.',
};
