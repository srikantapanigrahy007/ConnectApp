import { ADMIN_PERMISSION_MATRIX, ADMIN_ROLES } from '#shared';
import { Search, ShieldCheck, UserCog } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '../../../components/layout/Page';
import { Avatar } from '../../../components/ui/Avatar';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card, CardHeader } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Select } from '../../../components/ui/FormControls';
import { Input } from '../../../components/ui/Input';
import { ListSkeleton } from '../../../components/ui/Skeleton';
import { useToast } from '../../../components/ui/toast-context';
import { useSession } from '../../auth/hooks';
import { changeRole, listAdmins, listUsers } from '../api';
import { NoAccess } from '../components/NoAccess';
import { ReasonDialog } from '../components/ReasonDialog';
import { useAdminMutation, useAdminQuery, useCan } from '../hooks';
import { ROLE_LABELS } from '../labels';
import { StatusBadge } from './UsersPage';

const ROLE_CHOICES = [...ADMIN_ROLES, 'user'];

/** Super Admins grant and revoke admin roles. Nobody changes their own role. */
export function AdminRolesPage() {
  const can = useCan();
  if (!can('roles.manage')) {
    return (
      <>
        <PageHeader title="Admin roles" documentTitle="Admin roles" />
        <NoAccess />
      </>
    );
  }
  return (
    <>
      <PageHeader
        title="Admin roles"
        documentTitle="Admin roles"
        description="Who can use the admin panel, and what each role may do."
      />
      <div className="space-y-6">
        <AdminTeam />
        <PermissionMatrix />
      </div>
    </>
  );
}

function AdminTeam() {
  const session = useSession();
  const { toast } = useToast();
  const admins = useAdminQuery(['admins'], listAdmins);
  const [target, setTarget] = useState(null);
  const [role, setRole] = useState('moderator');
  const change = useAdminMutation(({ userId, newRole, reason }) =>
    changeRole(userId, newRole, reason),
  );

  const edit = (user) => {
    setTarget(user);
    setRole(user.role === 'user' ? 'moderator' : user.role);
  };

  return (
    <Card>
      <CardHeader
        title="Admin team"
        description="Role changes apply on the person’s next request."
      />
      <FindUser onFound={edit} />
      {admins.isPending ? (
        <ListSkeleton rows={3} label="Loading admins…" />
      ) : admins.isError ? (
        <div className="p-4">
          <ErrorState message={admins.error.message} onRetry={() => void admins.refetch()} />
        </div>
      ) : admins.data.length === 0 ? (
        <EmptyState icon={UserCog} title="No admins" />
      ) : (
        <ul className="divide-y divide-border" aria-label="Admins">
          {admins.data.map((user) => (
            <li key={user.id} className="flex items-center gap-3 px-5 py-3">
              <Avatar name={user.displayName} src={user.avatarUrl} size="sm" decorative />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">
                  {user.displayName}
                  {user.id === session.user?.id ? ' (you)' : ''}
                </span>
                <span className="block truncate text-xs text-ink-muted">@{user.username}</span>
              </span>
              <Badge tone="primary">{ROLE_LABELS[user.role]}</Badge>
              <StatusBadge status={user.status} />
              {user.id !== session.user?.id ? (
                <Button size="sm" variant="secondary" onClick={() => edit(user)}>
                  Change role
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <ReasonDialog
        open={Boolean(target)}
        title={target ? `Change ${target.displayName}’s role` : ''}
        description={`Currently: ${target ? ROLE_LABELS[target.role] : ''}`}
        confirmLabel="Save role"
        tone="primary"
        onClose={() => setTarget(null)}
        onConfirm={async (reason) => {
          await change.mutateAsync({ userId: target.id, newRole: role, reason });
          toast({ tone: 'success', title: `Role set to ${ROLE_LABELS[role]}` });
        }}
      >
        <label className="block text-sm font-medium text-ink">
          New role
          <Select className="mt-1" value={role} onChange={(event) => setRole(event.target.value)}>
            {ROLE_CHOICES.map((value) => (
              <option key={value} value={value}>
                {value === 'user' ? 'No admin role' : ROLE_LABELS[value]}
              </option>
            ))}
          </Select>
        </label>
      </ReasonDialog>
    </Card>
  );
}

/** Finds a user by exact username or email, to give them a role. */
function FindUser({ onFound }) {
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const find = async (event) => {
    event.preventDefault();
    const q = query.trim().replace(/^@/, '').toLowerCase();
    if (!q) return;
    setBusy(true);
    setMessage(null);
    try {
      const { items } = await listUsers({ q, limit: 10 });
      const user = items.find((item) => item.username === q || item.email === q);
      if (user) {
        onFound(user);
        setQuery('');
      } else {
        setMessage('No account with that exact username or email.');
      }
    } catch (failure) {
      setMessage(failure.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={find} className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row">
      <div className="min-w-0 flex-1">
        <Input
          type="search"
          aria-label="Find a user to give a role"
          placeholder="Exact username or email"
          leadingIcon={Search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {message ? (
          <p role="alert" className="mt-1 text-sm text-danger-700">
            {message}
          </p>
        ) : null}
      </div>
      <Button type="submit" variant="secondary" loading={busy}>
        Find user
      </Button>
    </form>
  );
}

function PermissionMatrix() {
  return (
    <Card>
      <CardHeader
        title="Permissions"
        description="The API enforces the same matrix on every admin request."
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <caption className="sr-only">Permission matrix</caption>
          <thead className="border-b border-border bg-surface-muted text-xs text-ink-muted">
            <tr>
              <th scope="col" className="px-4 py-2 font-semibold">
                Permission
              </th>
              {ADMIN_ROLES.map((role) => (
                <th key={role} scope="col" className="px-4 py-2 font-semibold">
                  {ROLE_LABELS[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {Object.entries(ADMIN_PERMISSION_MATRIX).map(([permission, roles]) => (
              <tr key={permission}>
                <th scope="row" className="px-4 py-2 font-mono text-xs font-normal text-ink">
                  {permission}
                </th>
                {ADMIN_ROLES.map((role) => (
                  <td key={role} className="px-4 py-2">
                    {roles.includes(role) ? (
                      <ShieldCheck aria-label="Allowed" className="size-4 text-success-600" />
                    ) : (
                      <span className="text-ink-subtle">
                        <span aria-hidden="true">—</span>
                        <span className="sr-only">Not allowed</span>
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
