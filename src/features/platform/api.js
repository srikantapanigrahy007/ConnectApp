import { publicSettingsSchema } from '#shared';
import { apiClient, unwrap } from '../../lib/api-client';

/** Public: registration availability, limits and the maintenance banner. */
export async function getPublicSettings() {
  return unwrap(
    publicSettingsSchema,
    await apiClient.get('/settings/public', { skipSessionRefresh: true }),
  );
}
