import { Plus, Ticket, Users } from 'lucide-react';
import { useState } from 'react';
import { PageContainer, PageHeader } from '../../../components/layout/Page';
import { Button, ButtonLink } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { ListSkeleton } from '../../../components/ui/Skeleton';
import { CreateGroupDialog } from '../components/CreateGroupDialog';
import { GroupListItem } from '../components/GroupListItem';
import { useGroups } from '../hooks';

export function GroupsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const groups = useGroups();
  const openCreate = () => setCreateOpen(true);

  return (
    <PageContainer>
      <PageHeader
        title="Groups"
        description="Chat with several people at once."
        actions={
          <div className="flex gap-2">
            <ButtonLink to="/join" variant="secondary" icon={Ticket}>
              Join with a code
            </ButtonLink>
            <Button icon={Plus} onClick={openCreate}>
              New group
            </Button>
          </div>
        }
      />
      <Card>
        {groups.isPending ? (
          <ListSkeleton rows={3} label="Loading groups…" />
        ) : groups.isError ? (
          <div className="p-4">
            <ErrorState
              title="Couldn't load your groups"
              message={groups.error.message}
              onRetry={() => void groups.refetch()}
              isRetrying={groups.isFetching}
            />
          </div>
        ) : groups.data.length === 0 ? (
          <EmptyState
            icon={Users}
            headingLevel={2}
            title="No groups yet"
            description="Create a group, or join one with an invitation link or code."
            action={
              <Button variant="secondary" size="sm" icon={Plus} onClick={openCreate}>
                New group
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border" aria-label="Your groups">
            {groups.data.map((group) => (
              <li key={group.id}>
                <GroupListItem group={group} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <CreateGroupDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </PageContainer>
  );
}
