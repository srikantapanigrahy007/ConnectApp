import { Ban, PlayCircle, Search, Trash2, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '../../../components/layout/Page';
import { Avatar } from '../../../components/ui/Avatar';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Select } from '../../../components/ui/FormControls';
import { Input } from '../../../components/ui/Input';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useToast } from '../../../components/ui/toast-context';
import { cn } from '../../../lib/cn';
import { getGroup, listGroups, moderateGroup } from '../api';
import { AdminList } from '../components/AdminList';
import { NoAccess } from '../components/NoAccess';
import { ReasonDialog } from '../components/ReasonDialog';
import { useAdminMutation, useAdminPages, useAdminQuery, useCan } from '../hooks';
import { formatDateTime, GROUP_STATUS } from '../labels';

const PAGE_SIZE = 20;

function GroupStatusBadge({ status }) {
  const meta = GROUP_STATUS[status] ?? { label: status, tone: 'neutral' };
  return (
    <Badge tone={meta.tone} dot>
      {meta.label}
    </Badge>
  );
}

/** Group search and moderation. Admins see metadata and members, never messages. */
export function AdminGroupsPage() {
  const can = useCan();
  const [draft, setDraft] = useState('');
  const [filters, setFilters] = useState({ q: '', status: '' });
  const [selectedId, setSelectedId] = useState(null);
  const groups = useAdminPages(
    ['groups', filters],
    (cursor) => listGroups({ ...filters, cursor, limit: PAGE_SIZE }),
    { enabled: can('groups.view') },
  );

  if (!can('groups.view')) {
    return (
      <>
        <PageHeader title="Groups" documentTitle="Admin groups" />
        <NoAccess />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Groups"
        documentTitle="Admin groups"
        description="Review, suspend or remove groups. Messages are never shown here."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <form
            role="search"
            className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              setFilters((current) => ({ ...current, q: draft.trim() }));
            }}
          >
            <div className="min-w-0 flex-1">
              <Input
                type="search"
                aria-label="Search groups"
                placeholder="Group name"
                leadingIcon={Search}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
            </div>
            <Select
              aria-label="Group status"
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({ ...current, status: event.target.value }))
              }
            >
              <option value="">All groups</option>
              {Object.entries(GROUP_STATUS).map(([value, meta]) => (
                <option key={value} value={value}>
                  {meta.label}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>
          <AdminList
            query={groups}
            label="Groups"
            empty={{
              icon: UsersRound,
              title: 'No groups found',
              description: 'Try a different name or status.',
            }}
            renderItem={(group) => (
              <button
                type="button"
                onClick={() => setSelectedId(group.id)}
                aria-current={selectedId === group.id ? 'true' : undefined}
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-muted',
                  selectedId === group.id && 'bg-primary-50',
                )}
              >
                <Avatar name={group.name} src={group.avatarUrl} size="sm" decorative />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{group.name}</span>
                  <span className="block truncate text-xs text-ink-muted">
                    {group.memberCount} members
                    {group.openReports
                      ? ` · ${group.openReports} open ${group.openReports === 1 ? 'report' : 'reports'}`
                      : ''}
                  </span>
                </span>
                <GroupStatusBadge status={group.status} />
              </button>
            )}
          />
        </Card>
        {selectedId ? (
          <GroupDetails key={selectedId} groupId={selectedId} />
        ) : (
          <Card>
            <EmptyState
              icon={UsersRound}
              title="Select a group"
              description="Details, members and moderation actions appear here."
            />
          </Card>
        )}
      </div>
    </>
  );
}

const ACTIONS = {
  suspend: {
    label: 'Suspend',
    icon: Ban,
    title: 'Suspend this group?',
    description:
      'Members keep their history but nobody can post, join, invite or change the group until it is unsuspended.',
    done: 'Group suspended',
  },
  unsuspend: {
    label: 'Unsuspend',
    icon: PlayCircle,
    tone: 'primary',
    title: 'Unsuspend this group?',
    description: 'Members can post and manage it again.',
    done: 'Group unsuspended',
  },
  remove: {
    label: 'Remove',
    icon: Trash2,
    title: 'Remove this group permanently?',
    description:
      'The group is deleted for every member, like the owner deleting it. This can’t be undone.',
    done: 'Group removed',
  },
};

function GroupDetails({ groupId }) {
  const can = useCan();
  const { toast } = useToast();
  const [dialog, setDialog] = useState(null);
  const group = useAdminQuery(['group', groupId], () => getGroup(groupId));
  const moderate = useAdminMutation(({ action, reason }) => moderateGroup(groupId, action, reason));

  if (group.isPending) {
    return (
      <Card className="space-y-3 p-5" role="status">
        <span className="sr-only">Loading group…</span>
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-24 w-full" />
      </Card>
    );
  }
  if (group.isError) {
    return <ErrorState message={group.error.message} onRetry={() => void group.refetch()} />;
  }
  const g = group.data;
  const available =
    can('groups.moderate') && g.status !== 'deleted'
      ? [g.status === 'suspended' ? 'unsuspend' : 'suspend', 'remove']
      : [];
  const current = ACTIONS[dialog];

  return (
    <Card aria-labelledby="admin-group-title">
      <div className="flex items-start gap-3 border-b border-border px-5 py-4">
        <Avatar name={g.name} src={g.avatarUrl} decorative />
        <div className="min-w-0 flex-1">
          <h2 id="admin-group-title" className="truncate text-base font-semibold text-ink">
            {g.name}
          </h2>
          {g.description ? <p className="text-sm text-ink-muted">{g.description}</p> : null}
        </div>
        <GroupStatusBadge status={g.status} />
      </div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 px-5 py-4 text-sm sm:grid-cols-2">
        {[
          ['Created', formatDateTime(g.createdAt)],
          [
            'Created by',
            g.createdBy ? `${g.createdBy.displayName} (@${g.createdBy.username})` : '—',
          ],
          ['Members', String(g.memberCount)],
          ['Open reports', String(g.openReports)],
          ...(g.suspendedReason ? [['Suspension reason', g.suspendedReason]] : []),
        ].map(([term, detail]) => (
          <div key={term}>
            <dt className="text-xs text-ink-muted">{term}</dt>
            <dd className="break-words text-ink">{detail}</dd>
          </div>
        ))}
      </dl>
      {available.length ? (
        <div className="flex flex-wrap gap-2 border-t border-border px-5 py-4">
          {available.map((key) => (
            <Button
              key={key}
              size="sm"
              variant={ACTIONS[key].tone === 'primary' ? 'secondary' : 'danger'}
              icon={ACTIONS[key].icon}
              onClick={() => setDialog(key)}
            >
              {ACTIONS[key].label}
            </Button>
          ))}
        </div>
      ) : null}
      <section aria-labelledby="admin-group-members" className="border-t border-border">
        <h3 id="admin-group-members" className="px-5 pt-4 text-sm font-semibold text-ink">
          Members
        </h3>
        <ul className="divide-y divide-border">
          {g.members.map((member) => (
            <li key={member.user.id} className="flex items-center gap-3 px-5 py-2 text-sm">
              <Avatar
                name={member.user.displayName}
                src={member.user.avatarUrl}
                size="xs"
                decorative
              />
              <span className="min-w-0 flex-1 truncate text-ink">
                {member.user.displayName}{' '}
                <span className="text-ink-muted">@{member.user.username}</span>
              </span>
              <span className="text-xs text-ink-muted capitalize">{member.role}</span>
            </li>
          ))}
        </ul>
      </section>
      <ReasonDialog
        open={Boolean(current)}
        title={current?.title}
        description={current?.description}
        confirmLabel={current?.label}
        tone={current?.tone ?? 'danger'}
        onClose={() => setDialog(null)}
        onConfirm={async (reason) => {
          await moderate.mutateAsync({ action: dialog, reason });
          toast({ tone: 'success', title: current.done });
        }}
      />
    </Card>
  );
}
