import { Ban } from 'lucide-react';
import { PageHeader } from '../../../components/layout/Page';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { ListSkeleton } from '../../../components/ui/Skeleton';
import { useToast } from '../../../components/ui/toast-context';
import { formatListTimestamp } from '../../../lib/format-time';
import { UserListItem } from '../../users/components/UserListItem';
import { useBlocks, useUnblockUser } from '../../users/hooks';

function UnblockButton({ user }) {
  const unblock = useUnblockUser();
  const { toast } = useToast();
  return (
    <Button
      variant="secondary"
      size="sm"
      loading={unblock.isPending}
      onClick={() =>
        unblock.mutate(user.id, {
          onSuccess: () => toast({ title: `Unblocked @${user.username}` }),
        })
      }
    >
      Unblock
    </Button>
  );
}

export function BlockedUsersPage() {
  const blocks = useBlocks();

  return (
    <>
      <PageHeader
        title="Blocked users"
        description="Blocked people can't find your profile, send you requests or message you, and you can't message them. They aren't told that you blocked them."
      />
      <Card>
        {blocks.isPending ? (
          <ListSkeleton rows={2} label="Loading blocked users…" />
        ) : blocks.isError ? (
          <div className="p-4">
            <ErrorState
              message={blocks.error.message}
              onRetry={() => void blocks.refetch()}
              isRetrying={blocks.isFetching}
            />
          </div>
        ) : blocks.data.length === 0 ? (
          <EmptyState
            icon={Ban}
            headingLevel={2}
            title="You haven't blocked anyone"
            description="You can block someone from the menu on their profile."
          />
        ) : (
          <ul className="divide-y divide-border">
            {blocks.data.map(({ user, blockedAt }) => (
              <li key={user.id}>
                <UserListItem
                  user={user}
                  meta={`Blocked ${formatListTimestamp(blockedAt)}`}
                  actions={<UnblockButton user={user} />}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
