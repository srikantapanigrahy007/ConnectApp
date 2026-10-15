import { apiErrorResponseSchema, paginatedResponseSchema } from '#shared';
import axios, { isAxiosError } from 'axios';

import { API_BASE_URL } from '../config/env';
import { emitSessionEnded, sessionEndReasonFor } from './session-events';

/** Normalised error thrown by every API call, whatever went wrong. */
export class ApiError extends Error {
  code;
  status;
  requestId;
  details;

  constructor(code, message, status, requestId, details = []) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
    this.details = details;
  }
}

export function toApiError(error) {
  if (error instanceof ApiError) return error;
  if (isAxiosError(error)) {
    if (!error.response) {
      return new ApiError('NETWORK_ERROR', 'Unable to reach the server. Check your connection.');
    }
    const parsed = apiErrorResponseSchema.safeParse(error.response.data);
    if (parsed.success) {
      const { code, message, requestId, details } = parsed.data.error;
      return new ApiError(code, message, error.response.status, requestId, details);
    }
    return new ApiError(
      'UNKNOWN_ERROR',
      `The server responded with status ${error.response.status}.`,
      error.response.status,
    );
  }
  return new ApiError('UNKNOWN_ERROR', 'Something went wrong. Please try again.');
}

/**
 * The Axios instance every API call uses. Besides the normal Axios options, requests may pass:
 * - `skipSessionRefresh: true`: don't try to refresh the session if this request returns 401.
 * - `retriedAfterRefresh` / `retriedAfterCsrf`: set internally so a request is retried at most once.
 */
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  // Session cookies are HttpOnly; the browser attaches them, page scripts never see them.
  withCredentials: true,
  timeout: 15_000,
  headers: { Accept: 'application/json' },
});

// ── CSRF ─────────────────────────────────────────────────────────────────────

const UNSAFE_METHODS = new Set(['post', 'put', 'patch', 'delete']);
let csrfToken = null;

function fetchCsrfToken() {
  csrfToken ??= apiClient
    .get('/auth/csrf', { skipSessionRefresh: true })
    .then((response) => response.data.data.csrfToken)
    .catch((error) => {
      csrfToken = null;
      throw toApiError(error);
    });
  return csrfToken;
}

apiClient.interceptors.request.use(async (config) => {
  if (UNSAFE_METHODS.has((config.method ?? 'get').toLowerCase())) {
    config.headers.set('X-CSRF-Token', await fetchCsrfToken());
  }
  return config;
});

// ── Session refresh ──────────────────────────────────────────────────────────

const REFRESH_EXEMPT = ['/auth/refresh', '/auth/login', '/auth/register', '/auth/logout'];
let refreshing = null;

async function refreshSessionOnce() {
  const run = () =>
    apiClient.post('/auth/refresh', undefined, { skipSessionRefresh: true }).then(() => undefined);
  // Serialise refreshes across tabs where supported, since tabs share the refresh cookie.
  if ('locks' in navigator) {
    await navigator.locks.request('connect-session-refresh', run);
  } else {
    await run();
  }
}

/** Single-flight: concurrent 401s share one refresh request. */
export function refreshSession() {
  refreshing ??= refreshSessionOnce().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function handleError(error) {
  const apiError = toApiError(error);
  const config = isAxiosError(error) ? error.config : undefined;
  if (!config) throw apiError;

  if (apiError.code === 'CSRF_TOKEN_INVALID' && !config.retriedAfterCsrf) {
    csrfToken = null;
    return apiClient.request({ ...config, retriedAfterCsrf: true });
  }

  const endReason = sessionEndReasonFor(apiError.code);
  if (endReason) {
    emitSessionEnded(endReason);
    throw apiError;
  }

  const canRefresh =
    apiError.status === 401 &&
    (apiError.code === 'ACCESS_TOKEN_EXPIRED' || apiError.code === 'UNAUTHORIZED') &&
    !config.skipSessionRefresh &&
    !config.retriedAfterRefresh &&
    !REFRESH_EXEMPT.some((path) => config.url?.startsWith(path));
  if (!canRefresh) throw apiError;

  try {
    await refreshSession();
  } catch (refreshError) {
    const refreshFailure = toApiError(refreshError);
    // Another tab rotated the token first; its new cookies are already in the jar.
    if (refreshFailure.code !== 'REFRESH_TOKEN_STALE') {
      const reason = sessionEndReasonFor(refreshFailure.code);
      if (reason) emitSessionEnded(reason);
      throw apiError;
    }
  }
  return apiClient.request({ ...config, retriedAfterRefresh: true });
}

apiClient.interceptors.response.use(undefined, handleError);

/** Parses the `{ data }` envelope of a successful response. */
export function unwrap(schema, response) {
  const parsed = schema.safeParse(response.data?.data);
  if (!parsed.success) {
    throw new ApiError('INVALID_RESPONSE', 'The server returned an unexpected response.');
  }
  return parsed.data;
}

/**
 * Parses a paginated response `{ data: [...], meta }`.
 *
 * @returns {{ items: unknown[], meta: { limit: number, hasMore: boolean, nextCursor: string | null } }}
 */
export function unwrapPage(itemSchema, response) {
  const parsed = paginatedResponseSchema(itemSchema).safeParse(response.data);
  if (!parsed.success) {
    throw new ApiError('INVALID_RESPONSE', 'The server returned an unexpected response.');
  }
  return { items: parsed.data.data, meta: parsed.data.meta };
}

/** Test helper: forget cached CSRF and refresh state. */
export function resetApiClientState() {
  csrfToken = null;
  refreshing = null;
}
