import { configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../lib/api-client';
import { testSession, testUser } from '../../../test/auth-fixtures';
import { renderRoute } from '../../../test/render';
import * as authApi from '../../auth/api';
import * as messagingApi from '../../messaging/api';
import { resetMessagingStore } from '../../messaging/store';
import * as groupsApi from '../api';

vi.mock('../../auth/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getSession: vi.fn(),
}));
vi.mock('../../messaging/api', () => ({
  listConversations: vi.fn(),
  getConversation: vi.fn(),
  listMessages: vi.fn(),
  sendMessage: vi.fn(),
}));
vi.mock('../api', () => ({
  listGroups: vi.fn(),
  createGroup: vi.fn(),
  getGroup: vi.fn(),
  updateGroup: vi.fn(),
  deleteGroup: vi.fn(),
  addMembers: vi.fn(),
  removeMember: vi.fn(),
  changeRole: vi.fn(),
  transferOwnership: vi.fn(),
  listInvites: vi.fn(),
  createInvite: vi.fn(),
  revokeInvite: vi.fn(),
  previewInvite: vi.fn(),
  joinInvite: vi.fn(),
  vote: vi.fn(),
  retractVote: vi.fn(),
  closePoll: vi.fn(),
}));

configure({ asyncUtilTimeout: 4_000 });

const api = vi.mocked(groupsApi);
const messaging = vi.mocked(messagingApi);
const ME = testUser().id;
const GROUP_ID = '64b0000000000000000000a1';
const card = (id, name) => ({
  id,
  username: name.toLowerCase(),
  displayName: name,
  avatarUrl: null,
  profileVisibility: 'public',
});

const group = (myRole = 'owner', overrides = {}) => ({
  id: GROUP_ID,
  name: 'Book club',
  description: 'Monthly books',
  avatarUrl: null,
  memberCount: 2,
  myRole,
  createdAt: new Date().toISOString(),
  members: [
    { user: card(ME, 'Ada'), role: myRole, joinedAt: new Date().toISOString() },
    {
      user: card('64b000000000000000000002', 'Grace'),
      role: myRole === 'owner' ? 'member' : 'owner',
      joinedAt: new Date().toISOString(),
    },
  ],
  ...overrides,
});

const directConversation = {
  id: '64b0000000000000000000c1',
  type: 'direct',
  peer: {
    ...card('64b000000000000000000002', 'Grace'),
    presence: { online: null, lastSeenAt: null },
  },
  group: null,
  lastMessage: null,
  lastActivityAt: new Date().toISOString(),
  unreadCount: 0,
  receipts: { lastDeliveredSeq: 0, lastReadSeq: 0 },
  peerReceipts: { lastDeliveredSeq: 0, lastReadSeq: 0 },
  preferences: {
    pinned: false,
    favorite: false,
    archived: false,
    markedUnread: false,
    mutedUntil: null,
  },
  pins: [],
  rules: { editWindowSeconds: 900, deleteWindowSeconds: 3600, pinLimit: 3 },
  canMessage: true,
  messagingUnavailableReason: null,
  createdAt: new Date().toISOString(),
};
const page = (items) => ({ items, meta: { limit: 30, hasMore: false, nextCursor: null } });

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  resetMessagingStore(null);
  vi.mocked(authApi.getSession).mockResolvedValue(testSession());
  messaging.listConversations.mockResolvedValue(page([directConversation]));
  api.listGroups.mockResolvedValue([]);
  api.listInvites.mockResolvedValue([]);
});

describe('groups list and creation', () => {
  it('creates a group with chosen people and only reports success from the server', async () => {
    const user = userEvent.setup();
    api.createGroup.mockResolvedValue(group());
    messaging.getConversation.mockReturnValue(new Promise(() => undefined));
    const { router } = renderRoute('/groups');
    expect(await screen.findByText('No groups yet')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'New group' })[0]);
    const dialog = screen.getByRole('dialog', { name: 'New group' });
    await user.type(within(dialog).getByLabelText('Group name'), 'Book club');
    await user.click(await within(dialog).findByLabelText('Grace (@grace)'));
    await user.click(within(dialog).getByRole('button', { name: 'Create group' }));
    expect(api.createGroup).toHaveBeenCalledWith({
      name: 'Book club',
      description: '',
      memberIds: ['64b000000000000000000002'],
    });
    expect(await screen.findByText('Group “Book club” created')).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe(`/chats/${GROUP_ID}`));
  });

  it('shows the server’s reason when creating fails', async () => {
    const user = userEvent.setup();
    api.createGroup.mockRejectedValue(
      new ApiError(
        'FORBIDDEN',
        'You can only add people you are connected with and can message.',
        403,
      ),
    );
    renderRoute('/groups');
    await user.click((await screen.findAllByRole('button', { name: 'New group' }))[0]);
    const dialog = screen.getByRole('dialog', { name: 'New group' });
    await user.type(within(dialog).getByLabelText('Group name'), 'x');
    await user.click(within(dialog).getByRole('button', { name: 'Create group' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('connected with');
  });
});

describe('group details', () => {
  it('lets the owner promote members and manage invitations (secrets shown once)', async () => {
    const user = userEvent.setup();
    api.getGroup.mockResolvedValue(group('owner'));
    api.changeRole.mockResolvedValue(group('owner'));
    api.createInvite.mockResolvedValue({
      id: 'i1',
      createdBy: ME,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      maxUses: null,
      uses: 0,
      revoked: false,
      state: 'active',
      token: 'A'.repeat(43),
      code: 'ABCD-EFGH',
    });
    renderRoute(`/groups/${GROUP_ID}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Book club' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Options for Grace' }));
    await user.click(screen.getByRole('menuitem', { name: 'Make admin' }));
    expect(api.changeRole).toHaveBeenCalledWith(GROUP_ID, '64b000000000000000000002', 'admin');
    expect(await screen.findByText('Grace is now an admin')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create invitation' }));
    expect(await screen.findByText('ABCD-EFGH')).toBeInTheDocument();
    expect(
      screen.getByText(`${window.location.origin}/join#t=${'A'.repeat(43)}`),
    ).toBeInTheDocument();
    expect(screen.getByText("Share this now: it won't be shown again.")).toBeInTheDocument();
    // The owner can't leave while others remain.
    expect(screen.getByRole('button', { name: 'Leave group' })).toBeDisabled();
  });

  it('plain members see no management controls', async () => {
    api.getGroup.mockResolvedValue(group('member'));
    renderRoute(`/groups/${GROUP_ID}`);
    await screen.findByRole('heading', { level: 1, name: 'Book club' });
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByText('Invitations')).toBeNull();
    expect(screen.queryByRole('button', { name: /Options for/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Leave group' })).toBeEnabled();
    expect(api.listInvites).not.toHaveBeenCalled();
  });

  it('shows "not found" for groups you are not in', async () => {
    api.getGroup.mockRejectedValue(new ApiError('NOT_FOUND', 'Group not found.', 404));
    renderRoute(`/groups/${GROUP_ID}`);
    expect(await screen.findByText('Group not found')).toBeInTheDocument();
  });
});

describe('joining with an invitation', () => {
  it('previews a code, then joins and opens the chat', async () => {
    const user = userEvent.setup();
    api.previewInvite.mockResolvedValue({
      groupId: GROUP_ID,
      name: 'Book club',
      avatarUrl: null,
      memberCount: 4,
      alreadyMember: false,
    });
    api.joinInvite.mockResolvedValue({ groupId: GROUP_ID, alreadyMember: false });
    messaging.getConversation.mockReturnValue(new Promise(() => undefined));
    const { router } = renderRoute('/join');
    await user.type(await screen.findByLabelText('Invitation code'), 'abcd-efgh');
    await user.click(screen.getByRole('button', { name: 'Check code' }));
    expect(api.previewInvite).toHaveBeenCalledWith({ code: 'abcd-efgh' });
    expect(await screen.findByText('4 members', { exact: false })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Join group' }));
    expect(api.joinInvite).toHaveBeenCalledWith({ code: 'abcd-efgh' });
    await waitFor(() => expect(router.state.location.pathname).toBe(`/chats/${GROUP_ID}`));
  });

  it('explains expired invitations', async () => {
    const user = userEvent.setup();
    api.previewInvite.mockRejectedValue(
      new ApiError('INVITE_EXPIRED', 'This invitation has expired.', 410),
    );
    renderRoute('/join');
    await user.type(await screen.findByLabelText('Invitation code'), 'ABCDEFGH');
    await user.click(screen.getByRole('button', { name: 'Check code' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This invitation has expired.');
    expect(api.joinInvite).not.toHaveBeenCalled();
  });
});

describe('group chat', () => {
  const groupConversation = (myRole) => ({
    ...directConversation,
    id: GROUP_ID,
    type: 'group',
    peer: null,
    group: { name: 'Book club', description: '', avatarUrl: null, memberCount: 2, myRole },
  });
  const message = (seq, overrides) => ({
    id: `6500000000000000000000${String(seq).padStart(2, '0')}`,
    conversationId: GROUP_ID,
    seq,
    clientMessageId: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    senderId: '64b000000000000000000002',
    type: 'text',
    text: '',
    attachment: null,
    sticker: null,
    poll: null,
    system: null,
    replyTo: null,
    forwarded: false,
    editedAt: null,
    deletedAt: null,
    reactions: [],
    rev: 0,
    createdAt: new Date().toISOString(),
    ...overrides,
  });

  it('shows group events with names, author names, polls and votes', async () => {
    const user = userEvent.setup();
    messaging.getConversation.mockResolvedValue(groupConversation('member'));
    api.getGroup.mockResolvedValue(group('member'));
    messaging.listMessages.mockResolvedValue(
      page([
        message(1, {
          type: 'system',
          system: {
            kind: 'member_added',
            actorId: '64b000000000000000000002',
            targetId: ME,
            name: null,
          },
        }),
        message(2, { text: 'Welcome!' }),
        message(3, {
          type: 'poll',
          text: 'Next book?',
          poll: {
            id: 'p1',
            question: 'Next book?',
            options: [
              { id: 'o1', text: 'Dune', votes: 1 },
              { id: 'o2', text: 'Emma', votes: 0 },
            ],
            multiple: false,
            closed: false,
            closedAt: null,
            creatorId: '64b000000000000000000002',
            totalVoters: 1,
            myVotes: [],
          },
        }),
      ]),
    );
    api.vote.mockResolvedValue({
      id: 'p1',
      question: 'Next book?',
      options: [
        { id: 'o1', text: 'Dune', votes: 1 },
        { id: 'o2', text: 'Emma', votes: 1 },
      ],
      multiple: false,
      closed: false,
      closedAt: null,
      creatorId: '64b000000000000000000002',
      totalVoters: 2,
      myVotes: ['o2'],
    });
    renderRoute(`/chats/${GROUP_ID}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Book club' })).toBeInTheDocument();
    expect(screen.getByText('2 members')).toBeInTheDocument();
    const log = await screen.findByRole('log');
    expect(await within(log).findByText('Grace added You')).toBeInTheDocument();
    expect(within(log).getAllByText('Grace').length).toBeGreaterThan(0);

    // Members can't close someone else's poll or pin messages.
    expect(within(log).queryByRole('button', { name: 'Close poll' })).toBeNull();
    await user.click(within(log).getByLabelText(/Emma/));
    await user.click(within(log).getByRole('button', { name: 'Vote' }));
    expect(api.vote).toHaveBeenCalledWith(GROUP_ID, 'p1', ['o2']);
    expect(await within(log).findByText('2 people voted')).toBeInTheDocument();
    const row = within(log).getByText('Welcome!').closest('[data-message-id]');
    await user.click(within(row).getByRole('button', { name: 'Message actions' }));
    expect(screen.queryByRole('menuitem', { name: 'Pin' })).toBeNull();
  });

  it('creates a poll from the composer', async () => {
    const user = userEvent.setup();
    messaging.getConversation.mockResolvedValue(groupConversation('admin'));
    api.getGroup.mockResolvedValue(group('admin'));
    messaging.listMessages.mockResolvedValue(page([]));
    messaging.sendMessage.mockReturnValue(new Promise(() => undefined));
    renderRoute(`/chats/${GROUP_ID}`);
    await user.click(await screen.findByRole('button', { name: 'Create a poll' }));
    const dialog = screen.getByRole('dialog', { name: 'New poll' });
    await user.type(within(dialog).getByLabelText('Question'), 'Lunch?');
    await user.type(within(dialog).getByLabelText('Option 1'), 'Pizza');
    await user.type(within(dialog).getByLabelText('Option 2'), 'Sushi');
    await user.click(within(dialog).getByRole('button', { name: 'Send poll' }));
    await waitFor(() =>
      expect(messaging.sendMessage).toHaveBeenCalledWith(
        GROUP_ID,
        expect.objectContaining({
          poll: { question: 'Lunch?', options: ['Pizza', 'Sushi'], multiple: false },
        }),
      ),
    );
  });
});
