import { configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../lib/api-client';
import { testSession } from '../../../test/auth-fixtures';
import { renderRoute } from '../../../test/render';
import * as authApi from '../../auth/api';
import * as messagingApi from '../api';
import { resetMessagingStore } from '../store';

vi.mock('../../auth/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getSession: vi.fn(),
}));
vi.mock('../api', () => ({
  listConversations: vi.fn(),
  getConversation: vi.fn(),
  listMessages: vi.fn(),
  updatePreferences: vi.fn(),
  removeConversation: vi.fn(),
}));

configure({ asyncUtilTimeout: 4_000 });

const api = vi.mocked(messagingApi);

const preferences = (overrides = {}) => ({
  pinned: false,
  favorite: false,
  archived: false,
  markedUnread: false,
  mutedUntil: null,
  ...overrides,
});

function conversation(id, name, overrides = {}) {
  return {
    id,
    type: 'direct',
    peer: {
      id: `${id}-peer`,
      username: name.toLowerCase(),
      displayName: name,
      avatarUrl: null,
      profileVisibility: 'public',
      presence: { online: null, lastSeenAt: null },
    },
    lastMessage: null,
    lastActivityAt: new Date().toISOString(),
    unreadCount: 0,
    receipts: { lastDeliveredSeq: 0, lastReadSeq: 0 },
    peerReceipts: { lastDeliveredSeq: 0, lastReadSeq: 0 },
    preferences: preferences(),
    pins: [],
    rules: { editWindowSeconds: 900, deleteWindowSeconds: 3600, pinLimit: 3 },
    canMessage: true,
    messagingUnavailableReason: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const page = (items) => ({ items, meta: { limit: 30, hasMore: false, nextCursor: null } });
const GRACE = conversation('64b0000000000000000000c1', 'Grace');
const ALAN = conversation('64b0000000000000000000c2', 'Alan');

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  resetMessagingStore(null);
  vi.mocked(authApi.getSession).mockResolvedValue(testSession());
  api.listConversations.mockImplementation(({ filter, q } = {}) => {
    if (filter === 'archived') return Promise.resolve(page([]));
    if (q) return Promise.resolve(page([GRACE].filter((c) => c.peer.username.startsWith(q))));
    return Promise.resolve(page([GRACE, ALAN]));
  });
});

const list = () => screen.findByRole('list', { name: 'Conversations' });

async function openRowMenu(user, name) {
  await user.click(await screen.findByRole('button', { name: `Chat options for ${name}` }));
}

describe('chat list management', () => {
  it('filters by archived, unread and favorites on the server, with empty states', async () => {
    const user = userEvent.setup();
    renderRoute('/chats');
    await list();
    await user.click(screen.getByRole('button', { name: 'Archived' }));
    expect(await screen.findByText('No archived chats')).toBeInTheDocument();
    expect(api.listConversations).toHaveBeenLastCalledWith(
      expect.objectContaining({ filter: 'archived' }),
    );
    expect(screen.getByRole('button', { name: 'Archived' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Favorites' }));
    await waitFor(() =>
      expect(api.listConversations).toHaveBeenLastCalledWith(
        expect.objectContaining({ filter: 'favorites' }),
      ),
    );
  });

  it('searches by username or name on the server', async () => {
    const user = userEvent.setup();
    renderRoute('/chats');
    await list();
    await user.type(screen.getByRole('searchbox'), 'gra');
    await waitFor(() =>
      expect(api.listConversations).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'gra' })),
    );
    await waitFor(() => expect(screen.queryByText('Alan')).toBeNull());
    expect(screen.getByText('Grace')).toBeInTheDocument();
  });

  it('archives from the row menu and confirms only after the server succeeds', async () => {
    const user = userEvent.setup();
    let resolve;
    api.updatePreferences.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    renderRoute('/chats');
    await list();
    await openRowMenu(user, 'Grace');
    await user.click(screen.getByRole('menuitem', { name: 'Archive' }));
    expect(api.updatePreferences).toHaveBeenCalledWith(GRACE.id, { archived: true });
    expect(screen.queryByText('Chat archived')).toBeNull();
    resolve({ ...GRACE, preferences: preferences({ archived: true }) });
    expect(await screen.findByText('Chat archived')).toBeInTheDocument();
  });

  it('shows the server’s reason when an action fails', async () => {
    const user = userEvent.setup();
    api.updatePreferences.mockRejectedValue(
      new ApiError('PIN_LIMIT_REACHED', 'You can pin up to 5 chats. Unpin one first.', 409),
    );
    renderRoute('/chats');
    await list();
    await openRowMenu(user, 'Alan');
    await user.click(screen.getByRole('menuitem', { name: 'Pin chat' }));
    expect(
      await screen.findByText('You can pin up to 5 chats. Unpin one first.'),
    ).toBeInTheDocument();
  });

  it('mutes and marks as unread from the menu', async () => {
    const user = userEvent.setup();
    api.updatePreferences.mockImplementation((id, change) =>
      Promise.resolve({ ...GRACE, preferences: preferences(change) }),
    );
    renderRoute('/chats');
    await list();
    await openRowMenu(user, 'Grace');
    await user.click(screen.getByRole('menuitem', { name: 'Mute for 8 hours' }));
    expect(api.updatePreferences).toHaveBeenCalledWith(GRACE.id, { muted: '8h' });
    await openRowMenu(user, 'Grace');
    await user.click(screen.getByRole('menuitem', { name: 'Mark as unread' }));
    expect(api.updatePreferences).toHaveBeenLastCalledWith(GRACE.id, { markedUnread: true });
  });

  it('removes a chat from your list after confirmation', async () => {
    const user = userEvent.setup();
    api.removeConversation.mockResolvedValue(undefined);
    renderRoute('/chats');
    await list();
    await openRowMenu(user, 'Alan');
    await user.click(screen.getByRole('menuitem', { name: 'Remove from list…' }));
    const dialog = screen.getByRole('dialog', { name: 'Remove this chat from your list?' });
    expect(dialog).toHaveTextContent('No messages are deleted');
    expect(api.removeConversation).not.toHaveBeenCalled();
    api.listConversations.mockResolvedValue(page([GRACE]));
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
    expect(api.removeConversation).toHaveBeenCalledWith(ALAN.id);
    expect(await screen.findByText('Chat removed from your list')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Alan')).toBeNull());
  });

  it('shows pinned, muted, favorite and marked-unread states', async () => {
    api.listConversations.mockResolvedValue(
      page([
        conversation('64b0000000000000000000c3', 'Ada', {
          preferences: preferences({
            pinned: true,
            favorite: true,
            markedUnread: true,
            mutedUntil: '9999-12-31T00:00:00.000Z',
          }),
        }),
      ]),
    );
    renderRoute('/chats');
    const rows = await list();
    for (const label of ['Pinned', 'Muted', 'Favorite']) {
      expect(within(rows).getByLabelText(label)).toBeInTheDocument();
    }
    expect(within(rows).getByText('Marked as unread')).toBeInTheDocument();
  });
});
