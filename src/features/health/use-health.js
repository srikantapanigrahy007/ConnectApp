import { useQuery } from '@tanstack/react-query';
import { fetchHealth } from './health.api';

export const healthQueryKey = ['health'];

export function useHealth() {
  return useQuery({
    queryKey: healthQueryKey,
    queryFn: fetchHealth,
    refetchInterval: 30_000,
  });
}
