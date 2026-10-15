import { desktopPermission } from '../notifications/desktop';

/**
 * A system notification for a ringing call while Connect is in a background tab (same rules as
 * notification alerts: turned on in settings, allowed by the browser). Clicking it brings the
 * tab forward, where the call can be answered. Never shown for a visible tab.
 */
export function showIncomingCallAlert(call, { enabled }) {
  if (!enabled || desktopPermission() !== 'granted') return false;
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return false;
  try {
    const alert = new window.Notification('Connect', {
      body: `${call.peer.displayName} is calling you (${call.type === 'video' ? 'video' : 'audio'})`,
      tag: `connect-call-${call.id}`,
      requireInteraction: true,
    });
    alert.onclick = () => {
      window.focus();
      alert.close();
    };
    return true;
  } catch {
    return false;
  }
}
