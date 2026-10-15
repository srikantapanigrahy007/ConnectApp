import { API_PREFIX } from '#shared';
import { z } from 'zod';

const envSchema = z.object({
  VITE_API_BASE_URL: z
    .union([z.literal(''), z.url({ protocol: /^https?$/ })])
    .default('')
    .transform((value) => value.replace(/\/+$/, '')),
});

const parsed = envSchema.safeParse(import.meta.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  throw new Error(`Invalid web environment configuration: ${issues}`);
}

/** Base URL for versioned REST calls, e.g. "/api/v1" or "https://api.example.com/api/v1". */
export const API_BASE_URL = `${parsed.data.VITE_API_BASE_URL}${API_PREFIX}`;

/** Socket.IO endpoint: the API origin, or this page's origin (proxied in development). */
export const SOCKET_URL = parsed.data.VITE_API_BASE_URL || window.location.origin;

/** Turns an API path such as "/api/v1/attachments/…" into a URL on the API's origin. */
export function apiUrl(path) {
  return `${parsed.data.VITE_API_BASE_URL}${path}`;
}
