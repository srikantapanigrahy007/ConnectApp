import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom does not implement <dialog> methods. This minimal stand-in toggles the `open`
// attribute only; focus trapping and the top layer are verified in a real browser.
if (typeof HTMLDialogElement !== 'undefined' && !('showModal' in HTMLDialogElement.prototype)) {
  Object.assign(HTMLDialogElement.prototype, {
    showModal() {
      this.setAttribute('open', '');
    },
    close() {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    },
  });
}

// No real WebSocket server in unit tests; socket behaviour is covered by the API tests. The
// stand-in never connects, so messaging falls back to HTTP (which tests mock per file).
vi.mock('socket.io-client', () => ({
  io: () => ({
    connected: false,
    active: false,
    on: () => undefined,
    off: () => undefined,
    emit: () => undefined,
    timeout: () => ({ emit: () => undefined }),
    connect: () => undefined,
    disconnect: () => undefined,
  }),
}));

afterEach(() => {
  cleanup();
});

// Public platform settings: the defaults (registration open, no maintenance banner) unless a
// test overrides getPublicSettings.
vi.mock('../features/platform/api', () => ({
  getPublicSettings: vi.fn(async () => ({
    registrationEnabled: true,
    uploadMaxBytes: 5 * 1024 * 1024,
    groupMaxMembers: 256,
    maintenanceBanner: { enabled: false, message: '' },
  })),
}));

// Notifications: an empty inbox and default preferences unless a test overrides the API.
vi.mock('../features/notifications/api', () => ({
  listNotifications: vi.fn(async () => ({
    items: [],
    meta: { limit: 30, hasMore: false, nextCursor: null },
  })),
  getUnreadCount: vi.fn(async () => 0),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  dismissNotification: vi.fn(),
  getNotificationPreferences: vi.fn(async () => ({
    enabled: true,
    messages: true,
    requests: true,
    groups: true,
    calls: true,
    desktop: false,
  })),
  updateNotificationPreferences: vi.fn(),
}));
