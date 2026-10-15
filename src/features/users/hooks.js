import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sessionQueryKey } from '../auth/hooks';
import * as usersApi from './api';

export const ownProfileKey = ['me', 'profile'];
export const profileKey = (username) => ['users', 'profile', username];
export const blocksKey = ['blocks'];

export function useOwnProfile() {
  return useQuery({ queryKey: ownProfileKey, queryFn: () => usersApi.getOwnProfile() });
}

/** Keeps the cached profile and the signed-in user (name, username, avatar) in sync. */
function useStoreOwnProfile() {
  const queryClient = useQueryClient();
  return (profile) => {
    queryClient.setQueryData(ownProfileKey, profile);
    void queryClient.invalidateQueries({ queryKey: sessionQueryKey });
  };
}

export function useUpdateProfile() {
  const store = useStoreOwnProfile();
  return useMutation({
    mutationFn: (changes) => usersApi.updateProfile(changes),
    onSuccess: store,
  });
}

export function useUpdatePrivacy() {
  const store = useStoreOwnProfile();
  return useMutation({
    mutationFn: (changes) => usersApi.updatePrivacy(changes),
    onSuccess: store,
  });
}

export function useUploadAvatar() {
  const store = useStoreOwnProfile();
  return useMutation({ mutationFn: (file) => usersApi.uploadAvatar(file), onSuccess: store });
}

export function useRemoveAvatar() {
  const store = useStoreOwnProfile();
  return useMutation({ mutationFn: () => usersApi.removeAvatar(), onSuccess: store });
}

export function useProfile(username) {
  return useQuery({
    queryKey: profileKey(username),
    queryFn: () => usersApi.getProfile(username),
    retry: false,
  });
}

/** Search results with "load more" pagination. Runs only once a query has been submitted. */
export function useUserSearch(q) {
  return useInfiniteQuery({
    queryKey: ['users', 'search', q],
    queryFn: ({ pageParam }) => usersApi.searchUsers({ q, cursor: pageParam }),
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.meta.nextCursor,
    enabled: Boolean(q),
  });
}

export function useBlocks() {
  return useQuery({ queryKey: blocksKey, queryFn: () => usersApi.listBlocks() });
}

/** After blocking or unblocking, anything about other people may have changed. */
function useRefreshPeople() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: blocksKey });
    void queryClient.invalidateQueries({ queryKey: ['users'] });
    void queryClient.invalidateQueries({ queryKey: ['requests'] });
  };
}

export function useBlockUser() {
  const refresh = useRefreshPeople();
  return useMutation({
    mutationFn: (username) => usersApi.blockUser(username),
    onSuccess: refresh,
  });
}

export function useUnblockUser() {
  const refresh = useRefreshPeople();
  return useMutation({ mutationFn: (userId) => usersApi.unblockUser(userId), onSuccess: refresh });
}
