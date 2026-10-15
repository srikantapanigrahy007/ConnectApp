import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../features/auth/api';
import { testSession } from '../test/auth-fixtures';
import { renderRoute } from '../test/render';

// Screens that embed the live health card would otherwise make real HTTP requests.
vi.mock('../features/health/health.api', () => ({
  fetchHealth: vi.fn(() => new Promise(() => undefined)),
}));
vi.mock('../features/auth/api', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getSession: vi.fn(),
    getProviders: vi.fn(() => Promise.resolve({ google: false })),
  };
});
const getSession = vi.mocked(authApi.getSession);

const signedInScreens = [
  ['/chats', 'Chats'],
  ['/chats/abc123', 'Conversation'],
  ['/discover', 'Discover people'],
  ['/requests', 'Message requests'],
  ['/groups', 'Groups'],
  ['/groups/g1', 'Group details'],
  ['/notifications', 'Notifications'],
  ['/profile', 'Your profile'],
  ['/users/ada', 'Profile'],
  ['/settings', 'Settings'],
  ['/settings/notifications', 'Notifications'],
  ['/settings/privacy', 'Privacy & security'],
  ['/settings/blocked', 'Blocked users'],
  ['/dev/ui', 'UI kit'],
  ['/no-such-page', 'Page not found'],
];

const publicScreens = [
  ['/', 'A calm place to keep in touch.'],
  ['/login', 'Sign in'],
  ['/register', 'Create your account'],
  ['/forgot-password', 'Reset your password'],
  ['/reset-password', 'This link has expired'],
  ['/verify-email', "This link can't be used"],
];

describe('routes when signed in', () => {
  beforeEach(() => {
    getSession.mockResolvedValue(testSession());
  });

  it.each(signedInScreens)('%s renders a single h1 "%s"', async (path, heading) => {
    renderRoute(path);

    // Lazy routes (e.g. /dev/ui) load a separate chunk, which can take over a second in CI.
    expect(
      await screen.findByRole('heading', { level: 1, name: heading }, { timeout: 4_000 }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('redirects / to /chats', async () => {
    const { router } = renderRoute('/');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/chats');
    });
  });

  it('sends signed-in users away from the sign-in page', async () => {
    const { router } = renderRoute('/login');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/chats');
    });
  });

  it('sets a descriptive document title', async () => {
    renderRoute('/discover');
    await waitFor(() => {
      expect(document.title).toBe('Discover people · Connect');
    });
  });

  it('shows the signed-in user in the account menu and no admin link for regular users', async () => {
    renderRoute('/chats');
    await screen.findByRole('heading', { level: 1, name: 'Chats' });

    expect(screen.getAllByText('@ada').length).toBeGreaterThan(0);
    const adminLinks = screen
      .queryAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith('/admin'));
    expect(adminLinks).toHaveLength(0);
  });

  it('blocks the admin area for non-admins', async () => {
    renderRoute('/admin');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Access denied' }),
    ).toBeInTheDocument();
  });

  it.each([
    ['/admin', 'Overview'],
    ['/admin/users', 'Users'],
    ['/admin/system', 'System'],
  ])('lets administrators open %s', async (path, heading) => {
    getSession.mockResolvedValue(testSession({ role: 'admin' }));
    renderRoute(path);
    // Lazy routes (e.g. /dev/ui) load a separate chunk, which can take over a second in CI.
    expect(
      await screen.findByRole('heading', { level: 1, name: heading }, { timeout: 4_000 }),
    ).toBeInTheDocument();
  });

  it('shows the email verification banner until the email is verified', async () => {
    getSession.mockResolvedValue(
      testSession({ emailVerified: false, status: 'pending_verification' }),
    );
    renderRoute('/chats');
    expect(await screen.findByText(/Verify your email address/)).toBeInTheDocument();
  });
});

describe('routes when signed out', () => {
  beforeEach(() => {
    getSession.mockResolvedValue(null);
  });

  it.each(publicScreens)('%s renders "%s"', async (path, heading) => {
    renderRoute(path);
    // Lazy routes (e.g. /dev/ui) load a separate chunk, which can take over a second in CI.
    expect(
      await screen.findByRole('heading', { level: 1, name: heading }, { timeout: 4_000 }),
    ).toBeInTheDocument();
  });

  it('redirects protected screens to sign-in and remembers where the user was going', async () => {
    const { router } = renderRoute('/settings/privacy');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login');
    });
    expect(router.state.location.search).toBe(
      `?returnTo=${encodeURIComponent('/settings/privacy')}`,
    );
  });

  it('keeps the admin area behind sign-in', async () => {
    const { router } = renderRoute('/admin');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login');
    });
  });
});
