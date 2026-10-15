import { Bell, CheckCheck } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { ListSkeleton } from '../../../components/ui/Skeleton';
import { useToast } from '../../../components/ui/toast-context';
import { ApiError } from '../../../lib/api-client';
import { flattenPages } from '../cache';
import { useDismissNotification, useMarkNotificationRead, useNotifications } from '../hooks';
import { NotificationItem } from './NotificationItem';

const empty = {
  all: {
    icon: Bell,
    title: 'No notifications yet',
    description: 'New messages, requests, group changes and missed calls show up here.',
  },
  unread: {
    icon: CheckCheck,
    title: "You're all caught up",
    description: 'Notifications you haven’t read yet appear here.',
  },
};

/**
 * Notifications with loading, empty, error and "load more" states. `limit` shows only the first
 * few (the bell's panel); otherwise every page can be loaded.
 */
export function NotificationList({ filter = 'all', limit, onNavigate }) {
  const notifications = useNotifications(filter);
  const markRead = useMarkNotificationRead();
  const dismiss = useDismissNotification();
  const { toast } = useToast();

  const failed = (title) => (error) =>
    toast({
      tone: 'danger',
      title,
      description: error instanceof ApiError ? error.message : undefined,
    });
  const readOne = (notification) => {
    if (!notification.read) {
      markRead.mutate(notification.id, { onError: failed("Couldn't mark it as read") });
    }
  };

  if (notifications.isPending) return <ListSkeleton rows={3} label="Loading notifications…" />;
  if (notifications.isError) {
    return (
      <div className="p-2">
        <ErrorState
          message={notifications.error.message}
          onRetry={() => void notifications.refetch()}
          isRetrying={notifications.isFetching}
        />
      </div>
    );
  }

  const all = flattenPages(notifications.data);
  const items = limit ? all.slice(0, limit) : all;
  if (items.length === 0) {
    const { icon, title, description } = empty[filter];
    return <EmptyState icon={icon} title={title} description={description} />;
  }

  return (
    <>
      <ul aria-label={filter === 'unread' ? 'Unread notifications' : 'Notifications'}>
        {items.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            compact={Boolean(limit)}
            onOpen={(opened) => {
              readOne(opened);
              onNavigate?.();
            }}
            onMarkRead={readOne}
            onDismiss={
              limit
                ? undefined
                : (target) => dismiss.mutate(target.id, { onError: failed("Couldn't dismiss it") })
            }
          />
        ))}
      </ul>
      {!limit && notifications.hasNextPage ? (
        <div className="flex justify-center p-3">
          <Button
            variant="secondary"
            size="sm"
            loading={notifications.isFetchingNextPage}
            onClick={() => void notifications.fetchNextPage()}
          >
            Load more
          </Button>
        </div>
      ) : null}
    </>
  );
}
