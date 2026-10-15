import { authProvidersSchema, authSessionSchema } from '#shared';
import { z } from 'zod';
import { API_BASE_URL } from '../../config/env';
import { ApiError, apiClient, unwrap } from '../../lib/api-client';

/** API calls for authentication. Components use the hooks in ./hooks, not these directly. */

/** The current session, or null when signed out. */
export async function getSession() {
  try {
    return unwrap(authSessionSchema, await apiClient.get('/auth/session'));
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export async function getProviders() {
  return unwrap(
    authProvidersSchema,
    await apiClient.get('/auth/providers', { skipSessionRefresh: true }),
  );
}

export async function register(input) {
  return unwrap(authSessionSchema, await apiClient.post('/auth/register', input));
}

export async function login(input) {
  return unwrap(authSessionSchema, await apiClient.post('/auth/login', input));
}

export async function logout() {
  await apiClient.post('/auth/logout');
}

export async function logoutAll() {
  await apiClient.post('/auth/logout-all');
}

export async function verifyEmail(token) {
  await apiClient.post('/auth/email/verify', { token }, { skipSessionRefresh: true });
}

export async function resendVerification() {
  await apiClient.post('/auth/email/resend');
}

const messageSchema = z.object({ message: z.string() });

/** Resolves with the server's neutral confirmation, whether or not the account exists. */
export async function requestPasswordReset(email) {
  return unwrap(
    messageSchema,
    await apiClient.post('/auth/password/forgot', { email }, { skipSessionRefresh: true }),
  ).message;
}

export async function resetPassword(token, password) {
  await apiClient.post('/auth/password/reset', { token, password }, { skipSessionRefresh: true });
}

export async function changePassword(input) {
  return unwrap(authSessionSchema, await apiClient.post('/auth/password/change', input));
}

export async function reauthenticate(password) {
  return unwrap(authSessionSchema, await apiClient.post('/auth/reauthenticate', { password }));
}

export async function deleteAccount() {
  await apiClient.delete('/account');
}

/** Full-page navigation target that starts the Google flow on the API. */
export function googleSignInUrl(intent, returnTo) {
  const params = new URLSearchParams({ intent, returnTo });
  return `${API_BASE_URL}/auth/google?${params.toString()}`;
}
