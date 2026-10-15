import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as groupsApi from './api';

export const groupsKey = ['groups'];
export const groupKey = (id) => ['groups', 'detail', id];
export const invitesKey = (id) => ['groups', 'invites', id];

export const isGroupId = (id) => typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id);

export function useGroups() {
  return useQuery({ queryKey: [...groupsKey, 'list'], queryFn: groupsApi.listGroups });
}

/** A group with its members (members only; others get 404). */
export function useGroup(id) {
  return useQuery({
    queryKey: groupKey(id),
    queryFn: () => groupsApi.getGroup(id),
    enabled: isGroupId(id),
    retry: false,
  });
}

export function useInvites(id, enabled) {
  return useQuery({
    queryKey: invitesKey(id),
    queryFn: () => groupsApi.listInvites(id),
    enabled: enabled && isGroupId(id),
  });
}

/**
 * Wraps a group call: on success the returned group (when there is one) replaces the cache, and
 * group lists and conversation summaries are refreshed.
 */
export function useGroupMutation(mutationFn, groupId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (result) => {
      if (result?.id && result.members && groupId) {
        queryClient.setQueryData(groupKey(groupId), result);
      }
      void queryClient.invalidateQueries({ queryKey: groupsKey });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
