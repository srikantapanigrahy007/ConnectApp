import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';
import { ApiError, toApiError } from './api-client';

function axiosErrorWithResponse(status, data) {
  const config = { headers: new AxiosHeaders() };
  const response = { status, statusText: '', data, headers: {}, config };
  return new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, null, response);
}

describe('toApiError', () => {
  it('maps the shared API error envelope', () => {
    const error = toApiError(
      axiosErrorWithResponse(404, {
        error: { code: 'NOT_FOUND', message: 'Route not found', requestId: 'req-1' },
      }),
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: 'NOT_FOUND',
      message: 'Route not found',
      status: 404,
      requestId: 'req-1',
    });
  });

  it('handles responses that are not in the envelope format', () => {
    const error = toApiError(axiosErrorWithResponse(502, '<html>Bad gateway</html>'));

    expect(error).toMatchObject({ code: 'UNKNOWN_ERROR', status: 502 });
  });

  it('reports network failures distinctly', () => {
    const error = toApiError(new AxiosError('Network Error', 'ERR_NETWORK'));

    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.status).toBeUndefined();
  });

  it('wraps unknown errors without leaking their message', () => {
    const error = toApiError(new Error('internal detail'));

    expect(error.code).toBe('UNKNOWN_ERROR');
    expect(error.message).not.toContain('internal detail');
  });
});
