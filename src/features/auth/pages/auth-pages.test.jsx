import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../lib/api-client';
import { emitSessionEnded } from '../../../lib/session-events';
import { testSession } from '../../../test/auth-fixtures';
import { renderRoute } from '../../../test/render';
import * as authApi from '../api';
import { GoogleButton } from '../components/GoogleButton';

// These tests cover the forms and their handling of API responses. The real API behaviour
// (hashing, sessions, rate limits) is tested against a real database in backend/test.
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getSession: vi.fn(),
    getProviders: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
    verifyEmail: vi.fn(),
  };
});
vi.mock('../../health/health.api', () => ({
  fetchHealth: vi.fn(() => new Promise(() => undefined)),
}));

const api = vi.mocked(authApi);

beforeEach(() => {
  vi.clearAllMocks();
  api.getSession.mockResolvedValue(null);
  api.getProviders.mockResolvedValue({ google: false });
});

describe('LoginPage', () => {
  it('validates locally and focuses the first invalid field without calling the API', async () => {
    const user = userEvent.setup();
    renderRoute('/login');

    await user.click(await screen.findByRole('button', { name: 'Sign in' }));

    const email = screen.getByLabelText('Email');
    expect(email).toHaveFocus();
    expect(email).toHaveAccessibleDescription('Enter your email address');
    expect(api.login).not.toHaveBeenCalled();
  });

  it('signs in and continues to the page the user was going to', async () => {
    const user = userEvent.setup();
    api.login.mockResolvedValue(testSession());
    const { router } = renderRoute(`/login?returnTo=${encodeURIComponent('/settings/privacy')}`);

    await user.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(api.login).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'correct horse' });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/settings/privacy');
    });
  });

  it('ignores unsafe return paths', async () => {
    const user = userEvent.setup();
    api.login.mockResolvedValue(testSession());
    const { router } = renderRoute(`/login?returnTo=${encodeURIComponent('//evil.example.com')}`);

    await user.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'pw');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/chats');
    });
  });

  it('shows the server error for wrong credentials', async () => {
    const user = userEvent.setup();
    api.login.mockRejectedValue(
      new ApiError('INVALID_CREDENTIALS', 'The email or password is incorrect.', 401),
    );
    renderRoute('/login');

    await user.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The email or password is incorrect.',
    );
  });

  it('offers Google only when the server has it configured', async () => {
    renderRoute('/login');
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument();

    api.getProviders.mockResolvedValue({ google: true });
    renderRoute('/login');
    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
  });

  it('explains Google sign-in failures from the callback redirect', async () => {
    renderRoute('/login?error=google_failed');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't sign you in with Google",
    );
  });

  it.each([
    ['google_conflict', 'already linked to a different Google account'],
    ['account_banned', 'This account has been banned.'],
    ['registration_disabled', 'New registrations are paused'],
    ['google_cancelled', 'Google sign-in was cancelled.'],
  ])('explains the %s outcome', async (code, text) => {
    renderRoute(`/login?error=${code}`);
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
  });

  it('ignores unknown error codes instead of showing them', async () => {
    renderRoute('/login?error=<script>alert(1)</script>');
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('GoogleButton', () => {
  it('starts sign-in once however often it is clicked, and shows progress', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<GoogleButton label="Continue with Google" onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Continue with Google' });
    await user.dblClick(button);
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Redirecting to Google…' })).toBeDisabled();

    // Coming back with the browser's Back button makes it usable again.
    act(() => window.dispatchEvent(new Event('pageshow')));
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
  });
});

describe('single-session sign-out', () => {
  it('sends the user to sign-in with an explanation when the session is superseded', async () => {
    api.getSession.mockResolvedValue(testSession());
    const { router } = renderRoute('/chats');
    await screen.findByRole('heading', { level: 1, name: 'Chats' });

    emitSessionEnded('superseded');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login');
    });
    expect(
      await screen.findAllByText(
        'You were signed out because your account signed in on another device.',
      ),
    ).not.toHaveLength(0);
  });
});

describe('RegisterPage', () => {
  it('validates username rules and password confirmation', async () => {
    const user = userEvent.setup();
    renderRoute('/register');

    await user.type(await screen.findByLabelText('Name'), 'Ada Lovelace');
    await user.type(screen.getByLabelText('Username'), 'Ada-L');
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'long enough password');
    await user.type(screen.getByLabelText('Confirm password'), 'different password');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByLabelText('Username')).toHaveFocus();
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    expect(api.register).not.toHaveBeenCalled();
  });

  it('shows conflicts from the server next to the right fields', async () => {
    const user = userEvent.setup();
    api.register.mockRejectedValue(
      new ApiError('CONFLICT', 'Some details are already in use.', 409, undefined, [
        { path: 'username', message: 'This username is taken' },
      ]),
    );
    renderRoute('/register');

    await user.type(await screen.findByLabelText('Name'), 'Ada Lovelace');
    await user.type(screen.getByLabelText('Username'), 'ada');
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'long enough password');
    await user.type(screen.getByLabelText('Confirm password'), 'long enough password');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('This username is taken')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('password reset', () => {
  it('shows the server’s neutral confirmation', async () => {
    const user = userEvent.setup();
    api.requestPasswordReset.mockResolvedValue(
      'If an account exists for that email, we sent a link to reset the password.',
    );
    renderRoute('/forgot-password');

    await user.type(await screen.findByLabelText('Email'), 'someone@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'If an account exists for that email',
    );
  });

  it('sets a new password from a valid link', async () => {
    const user = userEvent.setup();
    api.resetPassword.mockResolvedValue();
    const token = 'A'.repeat(43);
    renderRoute(`/reset-password?token=${token}`);

    await user.type(await screen.findByLabelText('New password'), 'a brand new passphrase');
    await user.type(screen.getByLabelText('Confirm new password'), 'a brand new passphrase');
    await user.click(screen.getByRole('button', { name: 'Update password' }));

    expect(api.resetPassword).toHaveBeenCalledWith(token, 'a brand new passphrase');
    expect(await screen.findByRole('heading', { name: 'Password updated' })).toBeInTheDocument();
  });

  it('explains expired links', async () => {
    const user = userEvent.setup();
    api.resetPassword.mockRejectedValue(new ApiError('INVALID_TOKEN', 'This link is invalid', 400));
    renderRoute(`/reset-password?token=${'B'.repeat(43)}`);

    await user.type(await screen.findByLabelText('New password'), 'a brand new passphrase');
    await user.type(screen.getByLabelText('Confirm new password'), 'a brand new passphrase');
    await user.click(screen.getByRole('button', { name: 'Update password' }));

    expect(
      await screen.findByRole('heading', { name: 'This link has expired' }),
    ).toBeInTheDocument();
  });
});

describe('VerifyEmailPage', () => {
  it('verifies the token exactly once', async () => {
    api.verifyEmail.mockResolvedValue();
    const token = 'C'.repeat(43);
    renderRoute(`/verify-email?token=${token}`);

    expect(await screen.findByRole('heading', { name: 'Email verified' })).toBeInTheDocument();
    expect(api.verifyEmail).toHaveBeenCalledTimes(1);
    expect(api.verifyEmail).toHaveBeenCalledWith(token);
  });
});
