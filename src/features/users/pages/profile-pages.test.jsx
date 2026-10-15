import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../lib/api-client';
import { testSession } from '../../../test/auth-fixtures';
import { renderRoute } from '../../../test/render';
import * as authApi from '../../auth/api';
import * as requestsApi from '../../requests/api';
import * as usersApi from '../api';

// UI behaviour only. Every rule shown here is enforced and tested on the API (backend/test).
vi.mock('../../auth/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getSession: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal()),
  getOwnProfile: vi.fn(),
  updateProfile: vi.fn(),
  uploadAvatar: vi.fn(),
  getProfile: vi.fn(),
  blockUser: vi.fn(),
  updatePrivacy: vi.fn(),
}));
vi.mock('../../requests/api', async (importOriginal) => ({
  ...(await importOriginal()),
  sendRequest: vi.fn(),
  answerRequest: vi.fn(),
}));

const users = vi.mocked(usersApi);
const requests = vi.mocked(requestsApi);

const ownProfile = (overrides = {}) => ({
  id: 'me',
  username: 'ada',
  displayName: 'Ada Lovelace',
  avatarUrl: null,
  profileVisibility: 'public',
  bio: 'Mathematician',
  joinedAt: '2026-01-02T10:00:00.000Z',
  privacy: {
    messagePermission: 'everyone',
    onlineStatusVisibility: 'connections',
    lastSeenVisibility: 'connections',
    readReceipts: true,
    typingIndicators: true,
  },
  ...overrides,
});

const otherProfile = (relationship = {}, overrides = {}) => ({
  id: 'u2',
  username: 'grace',
  displayName: 'Grace Hopper',
  avatarUrl: null,
  profileVisibility: 'public',
  access: 'full',
  bio: 'Compilers',
  joinedAt: '2026-01-02T10:00:00.000Z',
  presence: { online: null, lastSeenAt: null },
  relationship: {
    isSelf: false,
    connected: false,
    blockedByYou: false,
    outgoingRequest: null,
    incomingRequest: null,
    canSendRequest: true,
    requestUnavailableReason: null,
    ...relationship,
  },
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authApi.getSession).mockResolvedValue(testSession());
});

describe('your profile', () => {
  it('saves only the fields that changed', async () => {
    const user = userEvent.setup();
    users.getOwnProfile.mockResolvedValue(ownProfile());
    users.updateProfile.mockImplementation((changes) => Promise.resolve(ownProfile(changes)));
    renderRoute('/profile');

    const bio = await screen.findByLabelText(/Bio/);
    await user.clear(bio);
    await user.type(bio, 'Poet of science');
    await user.click(screen.getByLabelText(/Private/));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(users.updateProfile).toHaveBeenCalledWith({
      bio: 'Poet of science',
      profileVisibility: 'private',
    });
    expect(await screen.findByText('Profile saved')).toBeInTheDocument();
  });

  it('shows a taken username next to the field', async () => {
    const user = userEvent.setup();
    users.getOwnProfile.mockResolvedValue(ownProfile());
    users.updateProfile.mockRejectedValue(
      new ApiError('CONFLICT', 'That username is taken.', 409, undefined, [
        { path: 'username', message: 'This username is taken' },
      ]),
    );
    renderRoute('/profile');

    const username = await screen.findByLabelText('Username');
    await user.clear(username);
    await user.type(username, 'grace');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('This username is taken')).toBeInTheDocument();
    expect(username).toHaveAttribute('aria-invalid', 'true');
  });

  it('checks avatar type and size before uploading', async () => {
    const user = userEvent.setup({ applyAccept: false });
    users.getOwnProfile.mockResolvedValue(ownProfile());
    users.uploadAvatar.mockResolvedValue(ownProfile({ avatarUrl: '/api/v1/avatars/abc.webp' }));
    const { container } = renderRoute('/profile');
    await screen.findByRole('button', { name: 'Upload photo' });
    const input = container.querySelector('input[type=file]');

    await user.upload(input, new File(['gif'], 'a.gif', { type: 'image/gif' }));
    expect(await screen.findByText('Choose a JPEG, PNG or WebP image.')).toBeInTheDocument();

    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' });
    await user.upload(input, big);
    expect(await screen.findByText('Images must be 5 MB or smaller.')).toBeInTheDocument();
    expect(users.uploadAvatar).not.toHaveBeenCalled();

    const ok = new File(['png'], 'me.png', { type: 'image/png' });
    await user.upload(input, ok);
    await waitFor(() => expect(users.uploadAvatar).toHaveBeenCalledWith(ok));
  });
});

describe('someone else’s profile', () => {
  it('sends a message request with a note', async () => {
    const user = userEvent.setup();
    users.getProfile.mockResolvedValue(otherProfile());
    requests.sendRequest.mockResolvedValue({});
    renderRoute('/users/grace');

    await user.click(await screen.findByRole('button', { name: 'Send message request' }));
    await user.type(within(screen.getByRole('dialog')).getByRole('textbox'), 'Hello!');
    await user.click(screen.getByRole('button', { name: 'Send request' }));

    expect(requests.sendRequest).toHaveBeenCalledWith({ username: 'grace', note: 'Hello!' });
  });

  it('shows only limited details for a private profile', async () => {
    users.getProfile.mockResolvedValue(
      otherProfile(
        {},
        { access: 'limited', bio: null, joinedAt: null, profileVisibility: 'private' },
      ),
    );
    renderRoute('/users/grace');

    expect(await screen.findByText(/This profile is private/)).toBeInTheDocument();
    expect(screen.queryByText('Compilers')).not.toBeInTheDocument();
    expect(screen.queryByText(/Joined/)).not.toBeInTheDocument();
  });

  it.each([
    [
      { connected: true, canSendRequest: false, requestUnavailableReason: 'already_connected' },
      'Connected',
    ],
    [
      {
        incomingRequest: { id: 'r1' },
        canSendRequest: false,
        requestUnavailableReason: 'request_pending',
      },
      'Accept request',
    ],
    [
      {
        outgoingRequest: { id: 'r1', status: 'pending' },
        canSendRequest: false,
        requestUnavailableReason: 'request_pending',
      },
      'Cancel request',
    ],
    [
      { canSendRequest: false, requestUnavailableReason: 'not_accepting' },
      '@grace isn’t accepting message requests.',
    ],
  ])('shows the right action for %o', async (relationship, text) => {
    users.getProfile.mockResolvedValue(otherProfile(relationship));
    renderRoute('/users/grace');
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send message request' })).not.toBeInTheDocument();
  });

  it('accepts an incoming request', async () => {
    const user = userEvent.setup();
    users.getProfile.mockResolvedValue(
      otherProfile({
        incomingRequest: { id: 'r1' },
        canSendRequest: false,
        requestUnavailableReason: 'request_pending',
      }),
    );
    requests.answerRequest.mockResolvedValue({});
    renderRoute('/users/grace');

    await user.click(await screen.findByRole('button', { name: 'Accept request' }));
    expect(requests.answerRequest).toHaveBeenCalledWith('r1', 'accept');
  });

  it('blocks after confirmation', async () => {
    const user = userEvent.setup();
    users.getProfile.mockResolvedValue(otherProfile());
    users.blockUser.mockResolvedValue({});
    renderRoute('/users/grace');

    await user.click(await screen.findByRole('button', { name: 'More options' }));
    await user.click(screen.getByRole('menuitem', { name: 'Block @grace' }));
    await user.click(screen.getByRole('button', { name: 'Block' }));
    expect(users.blockUser).toHaveBeenCalledWith('grace');
  });

  it('treats unknown or hidden people as not found', async () => {
    users.getProfile.mockRejectedValue(
      new ApiError('NOT_FOUND', "We couldn't find that person.", 404),
    );
    renderRoute('/users/ghost');
    expect(await screen.findByText("We couldn't find @ghost")).toBeInTheDocument();
  });
});

describe('privacy settings', () => {
  it('saves a setting as soon as it changes', async () => {
    const user = userEvent.setup();
    users.getOwnProfile.mockResolvedValue(ownProfile());
    users.updatePrivacy.mockResolvedValue(ownProfile());
    renderRoute('/settings/privacy');

    await user.selectOptions(await screen.findByLabelText('Who can message me?'), 'connections');
    expect(users.updatePrivacy).toHaveBeenCalledWith({ messagePermission: 'connections' });

    await user.click(screen.getByRole('switch', { name: 'Read receipts' }));
    expect(users.updatePrivacy).toHaveBeenLastCalledWith({ readReceipts: false });
  });
});
