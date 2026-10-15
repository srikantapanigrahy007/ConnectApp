import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { testSession } from '../../../test/auth-fixtures';
import { renderRoute } from '../../../test/render';
import * as authApi from '../../auth/api';
import * as usersApi from '../api';

vi.mock('../../auth/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getSession: vi.fn(() => Promise.resolve(testSession())),
}));
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal()),
  searchUsers: vi.fn(),
}));

const searchUsers = vi.mocked(usersApi.searchUsers);
const card = (username, profileVisibility = 'public') => ({
  id: `id-${username}`,
  username,
  displayName: username.toUpperCase(),
  avatarUrl: null,
  profileVisibility,
});

beforeEach(() => {
  searchUsers.mockReset();
  vi.mocked(authApi.getSession).mockResolvedValue(testSession());
});

describe('DiscoverPage', () => {
  it('rejects characters that cannot appear in a username without calling the API', async () => {
    const user = userEvent.setup();
    renderRoute('/discover');

    await user.type(await screen.findByLabelText('Username'), 'ada lovelace{Enter}');

    expect(
      screen.getByText('Usernames only contain letters, numbers and underscores'),
    ).toBeInTheDocument();
    expect(searchUsers).not.toHaveBeenCalled();
  });

  it('normalises the query, shows results and marks private profiles', async () => {
    const user = userEvent.setup();
    searchUsers.mockResolvedValue({
      items: [card('ada_l', 'private'), card('ada_lovelace')],
      meta: { limit: 30, hasMore: false, nextCursor: null },
    });
    renderRoute('/discover');

    await user.type(await screen.findByLabelText('Username'), '@Ada_L');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByRole('link', { name: 'ADA_L' })).toHaveAttribute(
      'href',
      '/users/ada_l',
    );
    expect(searchUsers).toHaveBeenCalledWith({ q: 'ada_l', cursor: null });
    expect(screen.getByRole('link', { name: 'ADA_LOVELACE' })).toBeInTheDocument();
    expect(screen.getByText('Private profile')).toBeInTheDocument();
  });

  it('loads more results with the cursor', async () => {
    const user = userEvent.setup();
    searchUsers
      .mockResolvedValueOnce({
        items: [card('zed_a')],
        meta: { limit: 1, hasMore: true, nextCursor: 'CUR' },
      })
      .mockResolvedValueOnce({
        items: [card('zed_b')],
        meta: { limit: 1, hasMore: false, nextCursor: null },
      });
    renderRoute('/discover?q=zed');

    await user.click(await screen.findByRole('button', { name: 'Show more' }));

    expect(await screen.findByRole('link', { name: 'ZED_B' })).toBeInTheDocument();
    expect(searchUsers).toHaveBeenLastCalledWith({ q: 'zed', cursor: 'CUR' });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument(),
    );
  });

  it('explains when nobody matches', async () => {
    searchUsers.mockResolvedValue({
      items: [],
      meta: { limit: 30, hasMore: false, nextCursor: null },
    });
    renderRoute('/discover?q=nobody');
    expect(await screen.findByText('No one found for “nobody”')).toBeInTheDocument();
  });
});
