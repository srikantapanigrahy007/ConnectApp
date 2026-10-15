import { z } from 'zod';
import { apiClient, unwrap } from '../../lib/api-client';

/** Any signed-in user: report a user, a message or a group to the moderators. */
export async function createReport(report) {
  return unwrap(
    z.object({ id: z.string(), status: z.string() }),
    await apiClient.post('/reports', report),
  );
}
