import { Check, Inbox, Send, X } from 'lucide-react';
import { PageContainer, PageHeader } from '../../../components/layout/Page';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { ListSkeleton } from '../../../components/ui/Skeleton';
import { Tabs } from '../../../components/ui/Tabs';
import { useToast } from '../../../components/ui/toast-context';
import { ApiError } from '../../../lib/api-client';
import { formatListTimestamp } from '../../../lib/format-time';
import { UserListItem } from '../../users/components/UserListItem';
import { useAnswerRequest, useRequests } from '../hooks';

const statusBadge = {
  pending: { tone: 'primary', label: 'Pending' },
  accepted: { tone: 'success', label: 'Accepted' },
  rejected: { tone: 'neutral', label: 'Rejected' },
  cancelled: { tone: 'neutral', label: 'Cancelled' },
};

function RequestActions({ request }) {
  const answer = useAnswerRequest();
  const { toast } = useToast();
  const act = (action, message) =>
    answer.mutate(
      { id: request.id, action },
      {
        onSuccess: () => toast({ tone: 'success', title: message }),
        onError: (error) =>
          toast({
            tone: 'danger',
            title: error instanceof ApiError ? error.message : 'Something went wrong',
          }),
      },
    );

  if (request.status !== 'pending') {
    const badge = statusBadge[request.status];
    return <Badge tone={badge.tone}>{badge.label}</Badge>;
  }
  if (request.direction === 'received') {
    return (
      <>
        <Button
          size="sm"
          icon={Check}
          className="flex-1 sm:flex-none"
          loading={answer.isPending}
          onClick={() => act('accept', `You're now connected with @${request.otherUser.username}`)}
        >
          Accept
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={X}
          className="flex-1 sm:flex-none"
          disabled={answer.isPending}
          onClick={() => act('reject', 'Request rejected')}
        >
          Reject
        </Button>
      </>
    );
  }
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={answer.isPending}
      onClick={() => act('cancel', 'Request cancelled')}
    >
      Cancel
    </Button>
  );
}

function RequestList({ box }) {
  const requests = useRequests(box);
  if (requests.isPending) return <ListSkeleton rows={3} label="Loading requests…" />;
  if (requests.isError) {
    return (
      <ErrorState
        message={requests.error.message}
        onRetry={() => void requests.refetch()}
        isRetrying={requests.isFetching}
      />
    );
  }
  const items = requests.data.pages.flatMap((page) => page.items);
  if (items.length === 0) {
    return box === 'received' ? (
      <EmptyState
        icon={Inbox}
        title="No requests received"
        description="When someone new wants to message you, their request appears here."
      />
    ) : (
      <EmptyState
        icon={Send}
        title="No requests sent"
        description="Find people in Discover and send them a message request."
      />
    );
  }
  return (
    <>
      <ul className="-mx-4 divide-y divide-border">
        {items.map((request) => (
          <li key={request.id}>
            <UserListItem
              user={request.otherUser}
              meta={
                <>
                  {request.note ? <span className="text-ink">“{request.note}” · </span> : null}
                  {formatListTimestamp(request.createdAt)}
                </>
              }
              actions={<RequestActions request={request} />}
            />
          </li>
        ))}
      </ul>
      {requests.hasNextPage ? (
        <div className="pt-3 text-center">
          <Button
            variant="ghost"
            size="sm"
            loading={requests.isFetchingNextPage}
            onClick={() => void requests.fetchNextPage()}
          >
            Show more
          </Button>
        </div>
      ) : null}
    </>
  );
}

export function MessageRequestsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Message requests"
        description="People you aren't connected with have to ask before they can message you. Accept a request to connect and start chatting."
      />
      <Card className="px-4 pt-2 pb-4">
        <Tabs
          label="Message requests"
          tabs={[
            { id: 'received', label: 'Received', content: <RequestList box="received" /> },
            { id: 'sent', label: 'Sent', content: <RequestList box="sent" /> },
          ]}
        />
      </Card>
    </PageContainer>
  );
}
