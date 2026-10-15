import { ACCOUNT_STATUSES } from '#shared';
import { History, LogOut, Search, ShieldBan, ShieldCheck, UserRound, UserX } from 'lucide-react';
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
import { getUser, listUsers, moderateUser, revokeSessions } from '../api';
import { AdminList } from '../components/AdminList';
import { AuditEntry } from '../components/AuditEntry';
import { NoAccess } from '../components/NoAccess';
import { ReasonDialog } from '../components/ReasonDialog';
import { useAdminMutation, useAdminPages, useAdminQuery, useCan } from '../hooks';
import { ACCOUNT_STATUS, formatDateTime, ROLE_LABELS } from '../labels';

const PAGE_SIZE = 20;

export function StatusBadge({ status }) {
  const meta = ACCOUNT_STATUS[status] ?? { label: status, tone: 'neutral' };
  return (
    <Badge tone={meta.tone} dot>
      {meta.label}
    </Badge>
  );
}

/** Search (username prefix or exact email), filter by status, open details and moderate. */
export function AdminUsersPage() {
  const can = useCan();
  const [draft, setDraft] = useState('');
  const [filters, setFilters] = useState({ q: '', status: '' });
  const [selectedId, setSelectedId] = useState(null);
  const users = useAdminPages(
    ['users', filters],
    (cursor) => listUsers({ ...filters, cursor, limit: PAGE_SIZE }),
    { enabled: can('users.view') },
  );

  if (!can('users.view')) {
    return (
      <>
        <PageHeader title="Users" documentTitle="Admin users" />
        <NoAccess />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Users"
        documentTitle="Admin users"
        description="Search, review and moderate accounts."
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
                aria-label="Search users"
                placeholder="Username or exact email"
                leadingIcon={Search}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
            </div>
            <Select
              aria-label="Account status"
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({ ...current, status: event.target.value }))
              }
            >
              <option value="">All statuses</option>
              {ACCOUNT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {ACCOUNT_STATUS[status]?.label ?? status}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>
          <AdminList
            query={users}
            label="Users"
            empty={{
              icon: UserRound,
              title: 'No users found',
              description: 'Try a different username, email or status.',
            }}
            renderItem={(user) => (
              <button
                type="button"
                onClick={() => setSelectedId(user.id)}
                aria-current={selectedId === user.id ? 'true' : undefined}
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-muted',
                  selectedId === user.id && 'bg-primary-50',
                )}
              >
                <Avatar name={user.displayName} src={user.avatarUrl} size="sm" decorative />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">
                    {user.displayName}
                  </span>
                  <span className="block truncate text-xs text-ink-muted">
                    @{user.username || '—'} · {user.email ?? 'no email'}
                  </span>
                </span>
                {user.role !== 'user' ? (
                  <Badge tone="primary">{ROLE_LABELS[user.role]}</Badge>
                ) : null}
                <StatusBadge status={user.status} />
              </button>
            )}
          />
        </Card>
        {selectedId ? (
          <UserDetails key={selectedId} userId={selectedId} />
        ) : (
          <Card>
            <EmptyState
              icon={UserRound}
              title="Select a user"
              description="Account details, sessions and moderation history appear here."
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
    icon: UserX,
    from: ['active', 'pending_verification'],
    title: 'Suspend this account?',
    description: 'They are signed out everywhere and can’t sign in until restored.',
    done: 'Account suspended',
  },
  restore: {
    label: 'Restore',
    icon: ShieldCheck,
    from: ['suspended'],
    tone: 'primary',
    title: 'Restore this account?',
    description: 'They can sign in again.',
    done: 'Account restored',
  },
  ban: {
    label: 'Ban',
    icon: ShieldBan,
    from: ['active', 'pending_verification', 'suspended'],
    title: 'Ban this account?',
    description: 'They are signed out everywhere and can’t sign in or register again with it.',
    done: 'Account banned',
  },
  unban: {
    label: 'Unban',
    icon: ShieldCheck,
    from: ['banned'],
    tone: 'primary',
    title: 'Unban this account?',
    description: 'They can sign in again.',
    done: 'Account unbanned',
  },
};

function UserDetails({ userId }) {
  const can = useCan();
  const { toast } = useToast();
  const [dialog, setDialog] = useState(null);
  const user = useAdminQuery(['user', userId], () => getUser(userId));
  const moderate = useAdminMutation(({ action, reason }) => moderateUser(userId, action, reason));
  const logout = useAdminMutation((reason) => revokeSessions(userId, reason));

  if (user.isPending) {
    return (
      <Card className="space-y-3 p-5" role="status">
        <span className="sr-only">Loading user…</span>
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-24 w-full" />
      </Card>
    );
  }
  if (user.isError) {
    return <ErrorState message={user.error.message} onRetry={() => void user.refetch()} />;
  }
  const u = user.data;
  const available = can('users.moderate')
    ? Object.entries(ACTIONS).filter(([, action]) => action.from.includes(u.status))
    : [];
  const current = dialog === 'logout' ? null : ACTIONS[dialog];

  return (
    <Card aria-labelledby="admin-user-title">
      <div className="flex items-start gap-3 border-b border-border px-5 py-4">
        <Avatar name={u.displayName} src={u.avatarUrl} decorative />
        <div className="min-w-0 flex-1">
          <h2 id="admin-user-title" className="truncate text-base font-semibold text-ink">
            {u.displayName}
          </h2>
          <p className="truncate text-sm text-ink-muted">@{u.username || '—'}</p>
        </div>
        <StatusBadge status={u.status} />
      </div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 px-5 py-4 text-sm sm:grid-cols-2">
        {[
          [
            'Email',
            `${u.email ?? '—'}${u.email ? (u.emailVerified ? ' (verified)' : ' (unverified)') : ''}`,
          ],
          ['Role', ROLE_LABELS[u.role] ?? u.role],
          ['Joined', formatDateTime(u.createdAt)],
          ['Last sign-in', formatDateTime(u.lastLoginAt)],
          ['Last seen', u.online ? 'Online now' : formatDateTime(u.lastSeenAt)],
          ['Active sessions', String(u.activeSessions)],
        ].map(([term, detail]) => (
          <div key={term}>
            <dt className="text-xs text-ink-muted">{term}</dt>
            <dd className="break-words text-ink">{detail}</dd>
          </div>
        ))}
      </dl>
      {available.length > 0 || can('users.sessions') ? (
        <div className="flex flex-wrap gap-2 border-t border-border px-5 py-4">
          {available.map(([key, action]) => (
            <Button
              key={key}
              size="sm"
              variant={action.tone === 'primary' ? 'secondary' : 'danger'}
              icon={action.icon}
              onClick={() => setDialog(key)}
            >
              {action.label}
            </Button>
          ))}
          {can('users.sessions') ? (
            <Button
              size="sm"
              variant="secondary"
              icon={LogOut}
              disabled={u.activeSessions === 0}
              onClick={() => setDialog('logout')}
            >
              Force logout
            </Button>
          ) : null}
        </div>
      ) : null}

      {u.history ? (
        <section aria-labelledby="admin-user-history" className="border-t border-border">
          <h3
            id="admin-user-history"
            className="flex items-center gap-2 px-5 pt-4 text-sm font-semibold text-ink"
          >
            <History aria-hidden="true" className="size-4" /> Moderation history
          </h3>
          {u.history.length === 0 ? (
            <p className="px-5 py-4 text-sm text-ink-muted">No moderation actions yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {u.history.map((entry) => (
                <li key={entry.id}>
                  <AuditEntry entry={entry} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

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
      <ReasonDialog
        open={dialog === 'logout'}
        title="Sign this user out everywhere?"
        description="Every session ends and open connections close. They can sign in again."
        confirmLabel="Force logout"
        onClose={() => setDialog(null)}
        onConfirm={async (reason) => {
          const result = await logout.mutateAsync(reason);
          toast({ tone: 'success', title: `${result.revoked} session(s) ended` });
        }}
      />
    </Card>
  );
}
