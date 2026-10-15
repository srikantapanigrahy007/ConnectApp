import { configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../lib/api-client';
import { testSession, testUser } from '../../../test/auth-fixtures';
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
  openConversation: vi.fn(),
  listMessages: vi.fn(),
  sendMessage: vi.fn(),
}));

// The first render of the full route tree can take over a second on a busy machine.
configure({ asyncUtilTimeout: 4_000 });

const api = vi.mocked(messagingApi);
const ME = testUser().id;
const PEER = '64b000000000000000000002';
const CONVERSATION = '64b0000000000000000000c1';

function conversation(overrides = {}) {
  return {
    id: CONVERSATION,
    type: 'direct',
    peer: {
      id: PEER,
      username: 'grace',
      displayName: 'Grace Hopper',
      avatarUrl: null,
      profileVisibility: 'public',
      presence: { online: true, lastSeenAt: null },
    },
    lastMessage: null,
    lastActivityAt: new Date().toISOString(),
    unreadCount: 0,
    receipts: { lastDeliveredSeq: 0, lastReadSeq: 0 },
    peerReceipts: { lastDeliveredSeq: 0, lastReadSeq: 0 },
    canMessage: true,
    messagingUnavailableReason: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function stored(seq, text, senderId = PEER, clientMessageId = undefined) {
  return {
    id: `6500000000000000000000${String(seq).padStart(2, '0')}`,
    conversationId: CONVERSATION,
    seq,
    clientMessageId: clientMessageId ?? `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    senderId,
    text,
    createdAt: new Date().toISOString(),
  };
}

const page = (items, meta = {}) => ({
  items,
  meta: { limit: 30, hasMore: false, nextCursor: null, ...meta },
});

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  resetMessagingStore(null);
  vi.mocked(authApi.getSession).mockResolvedValue(testSession());
  api.listConversations.mockResolvedValue(page([conversation()]));
  api.getConversation.mockResolvedValue(conversation());
  api.listMessages.mockResolvedValue(page([stored(1, 'Hello Ada')]));
});

describe('ConversationPage', () => {
  it('shows the history and the other person’s presence', async () => {
    renderRoute(`/chats/${CONVERSATION}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Grace Hopper' })).toBeVisible();
    const log = await screen.findByRole('log', { name: 'Messages with Grace Hopper' });
    expect(within(log).getByText('Hello Ada')).toBeInTheDocument();
    expect(screen.getByText('Online', { selector: 'p' })).toBeInTheDocument();
  });

  it('renders message text as text, never as HTML', async () => {
    api.listMessages.mockResolvedValue(
      page([stored(1, '<img src=x onerror="alert(1)"><b>hi</b>')]),
    );
    renderRoute(`/chats/${CONVERSATION}`);
    const log = await screen.findByRole('log');
    expect(within(log).getByText('<img src=x onerror="alert(1)"><b>hi</b>')).toBeInTheDocument();
    expect(log.querySelector('img, b')).toBeNull();
  });

  it('shows a failed send with its reason, and retries it with the same message id', async () => {
    const user = userEvent.setup();
    api.sendMessage
      .mockRejectedValueOnce(
        new ApiError('NETWORK_ERROR', 'Unable to reach the server. Check your connection.'),
      )
      .mockImplementationOnce((_conversationId, { clientMessageId, text }) =>
        Promise.resolve({ message: stored(2, text, ME, clientMessageId), duplicate: false }),
      );
    renderRoute(`/chats/${CONVERSATION}`);
    await screen.findByText('Hello Ada');

    await user.type(screen.getByLabelText('Message'), 'Are you there?{Enter}');

    // The text stays visible in the conversation (not lost with the cleared draft).
    const log = screen.getByRole('log');
    expect(await within(log).findByText('Not sent')).toBeInTheDocument();
    expect(within(log).getByText('Are you there?')).toBeInTheDocument();
    expect(
      within(log).getByText('Unable to reach the server. Check your connection.'),
    ).toBeInTheDocument();
    // Never shown as sent before the server confirmed it.
    expect(within(log).queryByText('Sent')).toBeNull();

    await user.click(within(log).getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(within(log).getByText('Sent')).toBeInTheDocument());
    expect(within(log).queryByText('Not sent')).toBeNull();
    expect(within(log).getAllByText('Are you there?')).toHaveLength(1);
    const [first, second] = api.sendMessage.mock.calls;
    expect(second[1].clientMessageId).toBe(first[1].clientMessageId);
    expect(first[1]).toEqual({ clientMessageId: expect.any(String), text: 'Are you there?' });
  });

  it('can discard a failed message', async () => {
    const user = userEvent.setup();
    api.sendMessage.mockRejectedValue(
      new ApiError('MESSAGING_NOT_ALLOWED', "You can't message this person right now.", 403),
    );
    renderRoute(`/chats/${CONVERSATION}`);
    await screen.findByText('Hello Ada');
    await user.type(screen.getByLabelText('Message'), 'hello?{Enter}');
    const log = screen.getByRole('log');
    expect(await within(log).findByText("You can't message this person right now.")).toBeVisible();
    await user.click(within(log).getByRole('button', { name: 'Discard' }));
    expect(within(log).queryByText('hello?')).toBeNull();
  });

  it('explains and disables the composer when messaging is not allowed', async () => {
    api.getConversation.mockResolvedValue(
      conversation({ canMessage: false, messagingUnavailableReason: 'not_connected' }),
    );
    renderRoute(`/chats/${CONVERSATION}`);
    const notice = await screen.findByText(/You're not connected with @grace/, { selector: 'div' });
    expect(notice).toBeInTheDocument();
    expect(screen.getByLabelText('Message')).toBeDisabled();
  });

  it('shows read and delivered receipts for your own messages', async () => {
    api.getConversation.mockResolvedValue(
      conversation({ peerReceipts: { lastDeliveredSeq: 2, lastReadSeq: 1 } }),
    );
    api.listMessages.mockResolvedValue(
      page([stored(1, 'first', ME), stored(2, 'second', ME), stored(3, 'third', ME)]),
    );
    renderRoute(`/chats/${CONVERSATION}`);
    const log = await screen.findByRole('log');
    await within(log).findByText('third');
    expect(within(log).getByText('Read')).toBeInTheDocument();
    expect(within(log).getByText('Delivered')).toBeInTheDocument();
    expect(within(log).getByText('Sent')).toBeInTheDocument();
  });

  it('loads older messages with the cursor', async () => {
    const user = userEvent.setup();
    api.listMessages.mockImplementation((_id, { cursor } = {}) =>
      Promise.resolve(
        cursor
          ? page([stored(1, 'oldest')])
          : page([stored(2, 'newer')], { hasMore: true, nextCursor: '2' }),
      ),
    );
    renderRoute(`/chats/${CONVERSATION}`);
    await screen.findByText('newer');
    await user.click(screen.getByRole('button', { name: 'Load older messages' }));
    expect(await screen.findByText('oldest')).toBeInTheDocument();
    expect(api.listMessages).toHaveBeenLastCalledWith(CONVERSATION, { cursor: '2', limit: 30 });
    expect(screen.getByText(/This is the start of your conversation/)).toBeInTheDocument();
  });

  it('shows "not found" for conversations you are not part of', async () => {
    api.getConversation.mockRejectedValue(
      new ApiError('NOT_FOUND', 'Conversation not found.', 404),
    );
    renderRoute(`/chats/${CONVERSATION}`);
    expect(await screen.findByText('Conversation not found')).toBeInTheDocument();
  });
});

describe('Conversation list', () => {
  it('lists conversations with previews and unread counts', async () => {
    api.listConversations.mockResolvedValue(
      page([
        conversation({
          unreadCount: 3,
          lastMessage: {
            id: 'm1',
            seq: 3,
            senderId: PEER,
            preview: 'See you soon',
            createdAt: new Date().toISOString(),
          },
        }),
      ]),
    );
    renderRoute('/chats');
    const list = await screen.findByRole('list', { name: 'Conversations' });
    expect(within(list).getByText('Grace Hopper')).toBeInTheDocument();
    expect(within(list).getByText('See you soon')).toBeInTheDocument();
    expect(within(list).getByText('3 unread messages')).toBeInTheDocument();
  });

  it('shows an empty state without conversations', async () => {
    api.listConversations.mockResolvedValue(page([]));
    renderRoute('/chats');
    expect(await screen.findByText('No conversations yet')).toBeInTheDocument();
  });
});
