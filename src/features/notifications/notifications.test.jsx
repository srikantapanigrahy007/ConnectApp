import { NOTIFICATION_SOCKET_EVENTS as EVENTS } from '#shared';
import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setRealtimeSocket } from '../../lib/realtime-socket';
import { testSession } from '../../test/auth-fixtures';
import { renderRoute } from '../../test/render';
import * as authApi from '../auth/api';
import * as notificationsApi from './api';
import {
  flattenPages,
  markNotificationsRead,
  notificationListKey,
  notificationPreferencesKey,
  removeNotifications,
  unreadCountKey,
  upsertNotification,
} from './cache';
import { showDesktopAlert } from './desktop';
import { startNotificationsClient } from './notifications-client';

vi.mock('../auth/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getSession: vi.fn(),
}));

const api = vi.mocked(notificationsApi);

const notification = (overrides = {}) => ({
  id: 'n1',
  type: 'message_request_received',
  read: false,
  createdAt: '2026-10-14T10:00:00.000Z',
  count: 1,
  actor: {
    id: 'u2',
    username: 'grace',
    displayName: 'Grace Hopper',
    avatarUrl: null,
    profileVisibility: 'public',
  },
  conversationId: null,
  conversationType: null,
  groupName: null,
  role: null,
  link: '/requests',
  available: true,
  ...overrides,
});
const page = (items, meta = {}) => ({
  items,
  meta: { limit: 30, hasMore: false, nextCursor: null, ...meta },
});
const loadedList = (items) => ({ pages: [page(items)], pageParams: [null] });

const defaultPreferences = {
  enabled: true,
  messages: true,
  requests: true,
  groups: true,
  desktop: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authApi.getSession).mockResolvedValue(testSession());
  api.listNotifications.mockResolvedValue(page([]));
  api.getUnreadCount.mockResolvedValue(0);
  api.getNotificationPreferences.mockResolvedValue(defaultPreferences);
  api.updateNotificationPreferences.mockImplementation(async (changes) => ({
    ...defaultPreferences,
    ...changes,
  }));
});

describe('notification cache', () => {
  function clientWith(lists) {
    const queryClient = new QueryClient();
    for (const [filter, items] of Object.entries(lists)) {
      queryClient.setQueryData(notificationListKey(filter), loadedList(items));
    }
    return queryClient;
  }
  const itemsOf = (queryClient, filter) =>
    flattenPages(queryClient.getQueryData(notificationListKey(filter)));

  it('shows a notification once however often it arrives, newest first', () => {
    const queryClient = clientWith({ all: [notification({ id: 'old' })], unread: [] });
    const fresh = notification({ id: 'n9', count: 1 });
    upsertNotification(queryClient, fresh, 2);
    upsertNotification(queryClient, { ...fresh, count: 3 }, 2);
    expect(itemsOf(queryClient, 'all').map((n) => [n.id, n.count])).toEqual([
      ['n9', 3],
      ['old', 1],
    ]);
    expect(itemsOf(queryClient, 'unread').map((n) => n.id)).toEqual(['n9']);
    expect(queryClient.getQueryData(unreadCountKey)).toBe(2);

    // A read entry never enters the unread list.
    upsertNotification(queryClient, notification({ id: 'r', read: true }), 2);
    expect(itemsOf(queryClient, 'unread').map((n) => n.id)).toEqual(['n9']);
  });

  it('marks by id or by time, and removes', () => {
    const queryClient = clientWith({
      all: [
        notification({ id: 'late', createdAt: '2026-10-14T12:00:00.000Z' }),
        notification({ id: 'early', createdAt: '2026-10-14T09:00:00.000Z' }),
      ],
    });
    markNotificationsRead(queryClient, {
      ids: null,
      before: '2026-10-14T10:00:00.000Z',
      unreadCount: 1,
    });
    expect(itemsOf(queryClient, 'all').map((n) => n.read)).toEqual([false, true]);
    markNotificationsRead(queryClient, { ids: ['late'], unreadCount: 0 });
    expect(itemsOf(queryClient, 'all').every((n) => n.read)).toBe(true);
    removeNotifications(queryClient, { ids: ['early'], unreadCount: 0 });
    expect(itemsOf(queryClient, 'all').map((n) => n.id)).toEqual(['late']);
  });

  it('a moved entry on two pages is listed once', () => {
    const data = { pages: [page([notification()]), page([notification()])], pageParams: [] };
    expect(flattenPages(data)).toHaveLength(1);
  });
});

describe('live events', () => {
  function fakeSocket() {
    const handlers = new Map();
    return {
      connected: true,
      on: (event, handler) => handlers.set(event, handler),
      off: (event) => handlers.delete(event),
      fire: (event, payload) => handlers.get(event)?.(payload),
      has: (event) => handlers.has(event),
    };
  }

  afterEach(() => setRealtimeSocket(null));

  it('applies events from the socket, ignores malformed ones and refetches after reconnecting', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(notificationListKey('all'), loadedList([]));
    const socket = fakeSocket();
    const stop = startNotificationsClient(queryClient);
    setRealtimeSocket(socket);

    const entry = notification({ id: 'live' });
    socket.fire(EVENTS.upsert, { notification: entry, unreadCount: 1 });
    socket.fire(EVENTS.upsert, { notification: entry, unreadCount: 1 });
    socket.fire(EVENTS.upsert, { notification: { id: 'x', secret: true }, unreadCount: 9 });
    expect(flattenPages(queryClient.getQueryData(notificationListKey('all')))).toHaveLength(1);
    expect(queryClient.getQueryData(unreadCountKey)).toBe(1);

    socket.fire(EVENTS.read, { ids: ['live'], unreadCount: 0 });
    expect(flattenPages(queryClient.getQueryData(notificationListKey('all')))[0].read).toBe(true);

    socket.fire(EVENTS.preferences, { preferences: { desktop: true } });
    expect(queryClient.getQueryData(notificationPreferencesKey)).toEqual({ desktop: true });

    socket.fire(EVENTS.removed, { ids: ['live'], unreadCount: 0 });
    expect(flattenPages(queryClient.getQueryData(notificationListKey('all')))).toEqual([]);

    // Reconnecting marks everything stale so the server's state is fetched again.
    socket.fire('connect');
    await waitFor(() =>
      expect(queryClient.getQueryState(notificationListKey('all')).isInvalidated).toBe(true),
    );

    stop();
    expect(socket.has(EVENTS.upsert)).toBe(false);
  });
});

describe('desktop alerts', () => {
  const original = window.Notification;
  afterEach(() => {
    if (original === undefined) delete window.Notification;
    else window.Notification = original;
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  function installNotification(permission) {
    const created = [];
    const Fake = vi.fn(function (title, options) {
      created.push({ title, ...options });
    });
    Fake.permission = permission;
    Fake.requestPermission = vi.fn(async () => permission);
    window.Notification = Fake;
    return created;
  }

  it('alerts only when wanted, allowed and the tab is in the background', () => {
    const created = installNotification('granted');
    const entry = notification({ type: 'message_received', conversationType: 'direct' });
    expect(showDesktopAlert(entry, { enabled: true })).toBe(false); // tab visible
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    expect(showDesktopAlert(entry, { enabled: false })).toBe(false);
    expect(showDesktopAlert({ ...entry, read: true }, { enabled: true })).toBe(false);
    expect(showDesktopAlert(entry, { enabled: true })).toBe(true);
    expect(created).toEqual([
      { title: 'Connect', body: 'Grace Hopper sent you a message', tag: 'connect-n1' },
    ]);
  });

  it('a denied permission never alerts and keeps the setting off', async () => {
    installNotification('denied');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    expect(showDesktopAlert(notification(), { enabled: true })).toBe(false);

    const user = userEvent.setup();
    renderRoute('/settings/notifications');
    await user.click(await screen.findByRole('switch', { name: 'Desktop notifications' }));
    expect(api.updateNotificationPreferences).not.toHaveBeenCalled();
    expect(screen.getByText(/Your browser is blocking notifications/)).toBeInTheDocument();
  });

  it('turning desktop alerts on asks the browser first, then saves', async () => {
    const created = installNotification('default');
    window.Notification.requestPermission = vi.fn(async () => {
      window.Notification.permission = 'granted';
      return 'granted';
    });
    api.updateNotificationPreferences.mockImplementation(async (changes) => ({
      enabled: true,
      messages: true,
      requests: true,
      groups: true,
      desktop: false,
      ...changes,
    }));
    const user = userEvent.setup();
    renderRoute('/settings/notifications');
    const toggle = await screen.findByRole('switch', { name: 'Desktop notifications' });
    expect(window.Notification.requestPermission).not.toHaveBeenCalled();
    await user.click(toggle);
    expect(window.Notification.requestPermission).toHaveBeenCalledTimes(1);
    expect(api.updateNotificationPreferences).toHaveBeenCalledWith({ desktop: true });
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    expect(created).toEqual([]);
  });
});

describe('NotificationsPage', () => {
  it('lists notifications, links to what they are about and marks them read', async () => {
    const user = userEvent.setup();
    api.getUnreadCount.mockResolvedValue(2);
    api.listNotifications.mockResolvedValue(
      page([
        notification(),
        notification({
          id: 'n2',
          type: 'message_received',
          conversationType: 'group',
          groupName: 'Book club',
          count: 3,
          link: '/chats/c1',
          conversationId: 'c1',
        }),
        notification({
          id: 'n3',
          type: 'group_member_removed',
          read: true,
          actor: null,
          groupName: 'Old group',
          link: null,
        }),
        notification({
          id: 'n4',
          type: 'message_received',
          conversationType: 'direct',
          read: true,
          available: false,
          link: null,
        }),
      ]),
    );
    api.markNotificationRead.mockResolvedValue({
      notification: notification({ read: true }),
      unread: 1,
    });
    api.markAllNotificationsRead.mockResolvedValue({
      unread: 0,
      before: '2026-10-14T23:00:00.000Z',
    });
    renderRoute('/notifications');

    const list = await screen.findByRole('list', { name: 'Notifications' });
    expect(within(list).getByText('Grace Hopper sent you a message request')).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: /3 new messages in Book club/ })).toHaveAttribute(
      'href',
      '/chats/c1',
    );
    expect(within(list).getByText('You were removed from Old group')).toBeInTheDocument();
    expect(within(list).getByText('No longer available')).toBeInTheDocument();
    // Read or unavailable entries without a target are plain text, not links.
    expect(within(list).getAllByRole('link')).toHaveLength(2);
    expect(screen.getByRole('tab', { name: 'Unread (2)' })).toBeInTheDocument();

    await user.click(within(list).getAllByRole('button', { name: 'Mark as read' })[0]);
    expect(api.markNotificationRead).toHaveBeenCalledWith('n1');
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Unread (1)' })).toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: 'Mark all as read' }));
    expect(api.markAllNotificationsRead).toHaveBeenCalled();
    await waitFor(() =>
      expect(within(list).queryAllByRole('button', { name: 'Mark as read' })).toHaveLength(0),
    );
    expect(screen.getByRole('button', { name: 'Mark all as read' })).toBeDisabled();
  });

  it('loads more pages and dismisses', async () => {
    const user = userEvent.setup();
    api.listNotifications.mockImplementation(async ({ cursor }) =>
      cursor
        ? page([notification({ id: 'n2', type: 'message_request_accepted' })])
        : page([notification()], { hasMore: true, nextCursor: 'next' }),
    );
    api.dismissNotification.mockResolvedValue(undefined);
    renderRoute('/notifications');

    await user.click(await screen.findByRole('button', { name: 'Load more' }));
    expect(
      await screen.findByText('Grace Hopper accepted your message request'),
    ).toBeInTheDocument();
    expect(api.listNotifications).toHaveBeenLastCalledWith({ filter: 'all', cursor: 'next' });

    await user.click(screen.getAllByRole('button', { name: 'Dismiss notification' })[0]);
    expect(api.dismissNotification).toHaveBeenCalledWith('n1');
    await waitFor(() =>
      expect(screen.queryByText('Grace Hopper sent you a message request')).not.toBeInTheDocument(),
    );
  });

  it('shows empty and error states', async () => {
    const user = userEvent.setup();
    api.listNotifications.mockRejectedValueOnce(new Error('Network down'));
    renderRoute('/notifications');
    expect(await screen.findByText('Network down')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No notifications yet')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Unread' }));
    expect(await screen.findByText("You're all caught up")).toBeInTheDocument();
  });

  it('shows the unread count on the navigation', async () => {
    api.getUnreadCount.mockResolvedValue(4);
    renderRoute('/chats');
    expect((await screen.findAllByText('4 unread notifications')).length).toBeGreaterThan(0);
  });
});

describe('NotificationBell', () => {
  it('opens the latest notifications, closes with Escape and returns focus', async () => {
    const user = userEvent.setup();
    api.getUnreadCount.mockResolvedValue(1);
    api.listNotifications.mockResolvedValue(page([notification()]));
    renderRoute('/chats');

    const bell = await screen.findByRole('button', { name: 'Notifications, 1 unread' });
    await user.click(bell);
    const panel = screen.getByRole('dialog', { name: 'Notifications' });
    expect(
      await within(panel).findByText('Grace Hopper sent you a message request'),
    ).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'View all notifications' })).toHaveAttribute(
      'href',
      '/notifications',
    );
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument();
    expect(bell).toHaveFocus();
  });
});

describe('NotificationSettingsPage', () => {
  it('saves each preference to the account', async () => {
    const user = userEvent.setup();
    api.updateNotificationPreferences.mockImplementation(async (changes) => ({
      enabled: true,
      messages: true,
      requests: true,
      groups: true,
      desktop: false,
      ...changes,
    }));
    renderRoute('/settings/notifications');

    await user.click(await screen.findByRole('switch', { name: 'Groups' }));
    expect(api.updateNotificationPreferences).toHaveBeenCalledWith({ groups: false });
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Groups' })).toHaveAttribute(
        'aria-checked',
        'false',
      ),
    );

    // With notifications off, the categories read as off and can't change.
    await user.click(screen.getByRole('switch', { name: 'Notifications' }));
    expect(api.updateNotificationPreferences).toHaveBeenLastCalledWith({ enabled: false });
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Messages' })).toBeDisabled());
  });
});
