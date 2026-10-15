import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { testSession } from '../../../test/auth-fixtures';
import { renderRoute } from '../../../test/render';
import * as authApi from '../../auth/api';
import * as requestsApi from '../api';

vi.mock('../../auth/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getSession: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal()),
  listRequests: vi.fn(),
  answerRequest: vi.fn(),
}));

const api = vi.mocked(requestsApi);
const request = (overrides) => ({
  id: 'r1',
  status: 'pending',
  direction: 'received',
  note: 'Hi there',
  createdAt: new Date().toISOString(),
  respondedAt: null,
  otherUser: {
    id: 'u2',
    username: 'grace',
    displayName: 'Grace Hopper',
    avatarUrl: null,
    profileVisibility: 'public',
  },
  ...overrides,
});
const page = (items) => ({ items, meta: { limit: 30, hasMore: false, nextCursor: null } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authApi.getSession).mockResolvedValue(testSession());
});

describe('MessageRequestsPage', () => {
  it('accepts and rejects received requests', async () => {
    const user = userEvent.setup();
    api.listRequests.mockImplementation(({ box }) =>
      Promise.resolve(
        page(box === 'received' ? [request(), request({ id: 'r2', status: 'rejected' })] : []),
      ),
    );
    api.answerRequest.mockResolvedValue({});
    renderRoute('/requests');

    expect(await screen.findAllByText(/“Hi there”/)).toHaveLength(2);
    expect(screen.getByText('Rejected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Accept' }));
    expect(api.answerRequest).toHaveBeenCalledWith('r1', 'accept');
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    expect(api.answerRequest).toHaveBeenLastCalledWith('r1', 'reject');
  });

  it('cancels sent requests', async () => {
    const user = userEvent.setup();
    api.listRequests.mockImplementation(({ box }) =>
      Promise.resolve(page(box === 'sent' ? [request({ direction: 'sent' })] : [])),
    );
    api.answerRequest.mockResolvedValue({});
    renderRoute('/requests');

    expect(await screen.findByText('No requests received')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Sent' }));
    const panel = screen.getByRole('tabpanel');
    await user.click(await within(panel).findByRole('button', { name: 'Cancel' }));
    expect(api.answerRequest).toHaveBeenCalledWith('r1', 'cancel');
  });
});
