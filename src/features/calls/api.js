import { iceServersSchema } from '#shared';
import { apiClient, unwrap } from '../../lib/api-client';

/** STUN/TURN servers for a call (TURN credentials are short-lived; fetched for every call). */
export async function getIceServers() {
  return unwrap(iceServersSchema, await apiClient.get('/calls/ice-servers'));
}
