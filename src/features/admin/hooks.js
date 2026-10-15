import { hasAdminPermission } from '#shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../auth/hooks';

export const adminKey = ['admin'];

/**
 * Whether the signed-in admin holds a permission (same matrix as the API). Only decides what to
 * show; the API enforces every permission on its own.
 */
export function useCan() {
  const session = useSession();
  return (permission) => hasAdminPermission(session.user?.role, permission);
}

export function useAdminQuery(key, queryFn, options = {}) {
  return useQuery({ queryKey: [...adminKey, ...key], queryFn, retry: false, ...options });
}

/** An admin action; refreshes every admin view after the server confirms it. */
export function useAdminMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: adminKey }),
  });
}

/** A cursor-paginated admin list query (see AdminList). */
export function useAdminPages(key, fetchPage, { enabled = true } = {}) {
  return useInfiniteQuery({
    enabled,
    queryKey: [...adminKey, ...key],
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: null,
    getNextPageParam: (last) => last.meta.nextCursor,
    retry: false,
  });
}
