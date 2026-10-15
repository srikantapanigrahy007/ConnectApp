import { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiClient, resetApiClientState } from './api-client';
import { onSessionEnded } from './session-events';

/** Fake transport: answers each request from `route`, recording what was sent. */
function installServer(route) {
  const calls = [];
  const adapter = (config) => {
    calls.push(config);
    const reply = route(config);
    const response = {
      status: reply.status,
      statusText: '',
      data: reply.data ?? {},
      headers: {},
      config,
    };
    if (reply.status >= 400) {
      return Promise.reject(
        new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, null, response),
      );
    }
    return Promise.resolve(response);
  };
  apiClient.defaults.adapter = adapter;
  return calls;
}

const error = (status, code) => ({
  status,
  data: { error: { code, message: code } },
});
const csrf = { status: 200, data: { data: { csrfToken: 'csrf-1' } } };

const originalAdapter = apiClient.defaults.adapter;
beforeEach(() => {
  resetApiClientState();
});
afterEach(() => {
  apiClient.defaults.adapter = originalAdapter;
});

describe('session refresh', () => {
  it('refreshes once on ACCESS_TOKEN_EXPIRED and retries the original request', async () => {
    let refreshed = false;
    const calls = installServer((config) => {
      if (config.url === '/auth/csrf') return csrf;
      if (config.url === '/auth/refresh') {
        refreshed = true;
        return { status: 200 };
      }
      return refreshed ? { status: 200, data: { data: 'ok' } } : error(401, 'ACCESS_TOKEN_EXPIRED');
    });

    const response = await apiClient.get('/things');

    expect(response.data).toEqual({ data: 'ok' });
    expect(calls.map((call) => call.url)).toEqual([
      '/things',
      '/auth/csrf',
      '/auth/refresh',
      '/things',
    ]);
  });

  it('shares one refresh between concurrent requests', async () => {
    let refreshed = false;
    const calls = installServer((config) => {
      if (config.url === '/auth/csrf') return csrf;
      if (config.url === '/auth/refresh') {
        refreshed = true;
        return { status: 200 };
      }
      return refreshed ? { status: 200 } : error(401, 'ACCESS_TOKEN_EXPIRED');
    });

    await Promise.all([apiClient.get('/a'), apiClient.get('/b'), apiClient.get('/c')]);

    expect(calls.filter((call) => call.url === '/auth/refresh')).toHaveLength(1);
  });

  it('announces a superseded session instead of refreshing', async () => {
    const listener = vi.fn();
    const unsubscribe = onSessionEnded(listener);
    const calls = installServer(() => error(401, 'SESSION_SUPERSEDED'));

    await expect(apiClient.get('/things')).rejects.toMatchObject({ code: 'SESSION_SUPERSEDED' });

    expect(listener).toHaveBeenCalledWith('superseded');
    expect(calls.some((call) => call.url === '/auth/refresh')).toBe(false);
    unsubscribe();
  });

  it('reports the end of the session when refresh is rejected', async () => {
    const listener = vi.fn();
    const unsubscribe = onSessionEnded(listener);
    installServer((config) => {
      if (config.url === '/auth/csrf') return csrf;
      if (config.url === '/auth/refresh') return error(401, 'REFRESH_TOKEN_REUSED');
      return error(401, 'ACCESS_TOKEN_EXPIRED');
    });

    await expect(apiClient.get('/things')).rejects.toBeInstanceOf(ApiError);
    expect(listener).toHaveBeenCalledWith('revoked');
    unsubscribe();
  });

  it('never tries to refresh after a failed sign-in', async () => {
    const calls = installServer((config) =>
      config.url === '/auth/csrf' ? csrf : error(401, 'INVALID_CREDENTIALS'),
    );

    await expect(apiClient.post('/auth/login', {})).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(calls.some((call) => call.url === '/auth/refresh')).toBe(false);
  });
});

describe('CSRF', () => {
  it('sends the CSRF token on state-changing requests only', async () => {
    const calls = installServer((config) => (config.url === '/auth/csrf' ? csrf : { status: 200 }));

    await apiClient.get('/things');
    await apiClient.post('/things', {});

    const get = calls.find((call) => call.url === '/things' && call.method === 'get');
    const post = calls.find((call) => call.url === '/things' && call.method === 'post');
    expect(AxiosHeaders.from(get?.headers).get('X-CSRF-Token')).toBeUndefined();
    expect(AxiosHeaders.from(post?.headers).get('X-CSRF-Token')).toBe('csrf-1');
  });

  it('fetches a fresh token and retries once when the token is rejected', async () => {
    let tokenRequests = 0;
    const calls = installServer((config) => {
      if (config.url === '/auth/csrf') {
        tokenRequests += 1;
        return { status: 200, data: { data: { csrfToken: `csrf-${tokenRequests}` } } };
      }
      const token = AxiosHeaders.from(config.headers).get('X-CSRF-Token');
      return token === 'csrf-2' ? { status: 200 } : error(403, 'CSRF_TOKEN_INVALID');
    });

    await apiClient.post('/things', {});

    expect(tokenRequests).toBe(2);
    expect(calls.filter((call) => call.url === '/things')).toHaveLength(2);
  });
});
