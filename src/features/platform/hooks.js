import { useQuery } from '@tanstack/react-query';
import { getPublicSettings } from './api';

/** Public platform settings (maintenance banner, registration, limits); cached briefly. */
export function usePublicSettings() {
  return useQuery({
    queryKey: ['settings', 'public'],
    queryFn: getPublicSettings,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: false,
  });
}
