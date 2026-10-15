import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api-client';

const MAX_RETRIES = 2;

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Client errors (4xx) will not succeed on retry; network and 5xx errors might.
        retry: (failureCount, error) => {
          if (error instanceof ApiError && error.status !== undefined && error.status < 500) {
            return false;
          }
          return failureCount < MAX_RETRIES;
        },
      },
    },
  });
}
