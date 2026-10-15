import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as requestsApi from './api';

/** @param {'received' | 'sent'} box */
export function useRequests(box) {
  return useInfiniteQuery({
    queryKey: ['requests', box],
    queryFn: ({ pageParam }) => requestsApi.listRequests({ box, cursor: pageParam }),
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.meta.nextCursor,
  });
}

/** Requests change profiles (connected, pending) and both request lists. */
function useRefreshAfterRequestChange() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['requests'] });
    void queryClient.invalidateQueries({ queryKey: ['users', 'profile'] });
  };
}

export function useSendRequest() {
  const refresh = useRefreshAfterRequestChange();
  return useMutation({ mutationFn: (input) => requestsApi.sendRequest(input), onSuccess: refresh });
}

export function useAnswerRequest() {
  const refresh = useRefreshAfterRequestChange();
  return useMutation({
    mutationFn: ({ id, action }) => requestsApi.answerRequest(id, action),
    onSuccess: refresh,
  });
}
