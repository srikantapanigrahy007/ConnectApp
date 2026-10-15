import { messageRequestSchema } from '#shared';
import { apiClient, unwrap, unwrapPage } from '../../lib/api-client';

/** HTTP calls for message requests. Components use ./hooks.js instead. */

/** @param {{ box: 'received' | 'sent', status?: string, cursor?: string | null }} query */
export async function listRequests({ box, status, cursor }) {
  return unwrapPage(
    messageRequestSchema,
    await apiClient.get('/message-requests', {
      params: { box, ...(status ? { status } : {}), ...(cursor ? { cursor } : {}) },
    }),
  );
}

/** @param {{ username: string, note?: string }} input */
export async function sendRequest(input) {
  return unwrap(messageRequestSchema, await apiClient.post('/message-requests', input));
}

/** @param {string} id @param {'accept' | 'reject' | 'cancel'} action */
export async function answerRequest(id, action) {
  return unwrap(messageRequestSchema, await apiClient.post(`/message-requests/${id}/${action}`));
}
