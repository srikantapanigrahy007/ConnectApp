import { describeNotification } from './describe';

/**
 * Desktop alerts: a system notification while Connect is open in a background tab. This uses
 * the browser's Notification API only; nothing is sent to a push service, and alerts carry the
 * same text as the notification list (never message text).
 */

/** @returns {'unsupported' | 'default' | 'granted' | 'denied'} */
export function desktopPermission() {
  if (typeof window === 'undefined' || typeof window.Notification !== 'function') {
    return 'unsupported';
  }
  return window.Notification.permission;
}

/** Asks the browser for permission. Call only from a click (browsers require a user action). */
export async function requestDesktopPermission() {
  if (desktopPermission() === 'unsupported') return 'unsupported';
  try {
    return await window.Notification.requestPermission();
  } catch {
    return desktopPermission();
  }
}

/**
 * Shows `notification` as a system notification if the user turned desktop alerts on, the
 * browser allows it and the tab is in the background. Failures are ignored: the in-app list
 * and badge are unaffected.
 */
export function showDesktopAlert(notification, { enabled, onOpen }) {
  if (!enabled || notification.read) return false;
  if (desktopPermission() !== 'granted') return false;
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return false;
  try {
    // The tag makes a repeated or refreshed notification replace the previous alert.
    const alert = new window.Notification('Connect', {
      body: describeNotification(notification).text,
      tag: `connect-${notification.id}`,
    });
    alert.onclick = () => {
      window.focus();
      if (notification.link) onOpen?.(notification);
      alert.close();
    };
    return true;
  } catch {
    return false;
  }
}
