import { CheckCheck, Settings } from 'lucide-react';
import { PageContainer, PageHeader } from '../../../components/layout/Page';
import { Button, ButtonLink } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Tabs } from '../../../components/ui/Tabs';
import { useToast } from '../../../components/ui/toast-context';
import { ApiError } from '../../../lib/api-client';
import { NotificationList } from '../components/NotificationList';
import { useMarkAllNotificationsRead, useUnreadNotificationCount } from '../hooks';

export function NotificationsPage() {
  const unread = useUnreadNotificationCount();
  const markAll = useMarkAllNotificationsRead();
  const { toast } = useToast();
  const unreadCount = unread.data ?? 0;

  return (
    <PageContainer>
      <PageHeader
        title="Notifications"
        description="Messages, requests, group changes and missed calls."
        actions={
          <>
            <ButtonLink variant="ghost" icon={Settings} to="/settings/notifications">
              Settings
            </ButtonLink>
            <Button
              variant="secondary"
              icon={CheckCheck}
              disabled={unreadCount === 0}
              loading={markAll.isPending}
              onClick={() =>
                markAll.mutate(undefined, {
                  onError: (error) =>
                    toast({
                      tone: 'danger',
                      title: "Couldn't mark notifications as read",
                      description: error instanceof ApiError ? error.message : undefined,
                    }),
                })
              }
            >
              Mark all as read
            </Button>
          </>
        }
      />
      <Card className="px-2 pt-2 pb-2">
        <Tabs
          label="Filter notifications"
          tabs={[
            { id: 'all', label: 'All', content: <NotificationList filter="all" /> },
            {
              id: 'unread',
              label:
                unreadCount > 0 ? `Unread (${unreadCount > 99 ? '99+' : unreadCount})` : 'Unread',
              content: <NotificationList filter="unread" />,
            },
          ]}
        />
      </Card>
    </PageContainer>
  );
}
