import { healthResponseSchema } from '#shared';
import { apiClient, unwrap } from '../../lib/api-client';

export async function fetchHealth() {
  return unwrap(healthResponseSchema, await apiClient.get('/health', { skipSessionRefresh: true }));
}
