import {
  Crown,
  EllipsisVertical,
  Flag,
  ImageUp,
  LogOut,
  MessageCircle,
  Pencil,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { LIMITS } from '#shared';
import { PageContainer, PageHeader } from '../../../components/layout/Page';
import { Alert } from '../../../components/ui/Alert';
import { Avatar } from '../../../components/ui/Avatar';
import { Badge } from '../../../components/ui/Badge';
import { Button, ButtonLink } from '../../../components/ui/Button';
import { buttonClasses } from '../../../components/ui/button-styles';
import { Card, CardHeader } from '../../../components/ui/Card';
import { Dialog } from '../../../components/ui/Dialog';
import { DropdownMenu } from '../../../components/ui/DropdownMenu';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Textarea } from '../../../components/ui/FormControls';
import { Input } from '../../../components/ui/Input';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useToast } from '../../../components/ui/toast-context';
import { ApiError } from '../../../lib/api-client';
import { useSession } from '../../auth/hooks';
import { ReportDialog } from '../../reports/ReportDialog';
import * as groupsApi from '../api';
import { GroupInvites } from '../components/GroupInvites';
import { PeoplePicker } from '../components/PeoplePicker';
import { isGroupId, useGroup, useGroupMutation } from '../hooks';

const ROLE_BADGE = {
  owner: { tone: 'primary', label: 'Owner' },
  admin: { tone: 'success', label: 'Admin' },
  member: null,
};

/** The menu for one member, offering only what the server allows the viewer to do. */
function memberItems(member, { myRole, selfId }, act) {
  const items = [];
  const isSelf = member.user.id === selfId;
  if (isSelf) return items;
  if (myRole === 'owner') {
    items.push(
      member.role === 'admin'
        ? { label: 'Remove admin role', icon: ShieldOff, onSelect: () => act('demote', member) }
        : { label: 'Make admin', icon: ShieldCheck, onSelect: () => act('promote', member) },
      { label: 'Make owner…', icon: Crown, onSelect: () => act('transfer', member) },
    );
  }
  if (myRole === 'owner' || (myRole === 'admin' && member.role === 'member')) {
    items.push(
      { type: 'separator' },
      {
        label: 'Remove from group…',
        icon: UserMinus,
        tone: 'danger',
        onSelect: () => act('remove', member),
      },
    );
  }
  return items;
}

/** Group details at /groups/:groupId: about, members and roles, invitations and actions. */
export function GroupDetailsPage() {
  const { groupId = '' } = useParams();
  const group = useGroup(groupId);
  const { user } = useSession();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: '', description: '' });
  const [adding, setAdding] = useState(false);
  const [toAdd, setToAdd] = useState([]);
  const [confirm, setConfirm] = useState(null);
  const [reporting, setReporting] = useState(false);
  const fileRef = useRef(null);
  const mutation = useGroupMutation((task) => task(), groupId);

  const failed = (error) =>
    toast({
      tone: 'danger',
      title: error instanceof ApiError ? error.message : 'Something went wrong. Try again.',
    });
  const run = (task, success, after) =>
    mutation.mutate(task, {
      onSuccess: (result) => {
        if (success) toast({ tone: 'success', title: success });
        after?.(result);
      },
      onError: failed,
    });

  const notFound =
    !isGroupId(groupId) || (group.error instanceof ApiError && group.error.status === 404);

  if (notFound || group.isPending || group.isError) {
    return (
      <PageContainer width="lg">
        <PageHeader title="Group details" backTo={{ to: '/groups', label: 'Groups' }} />
        {group.isPending && !notFound ? (
          <Card className="p-6" role="status">
            <span className="sr-only">Loading group…</span>
            <Skeleton className="h-6 w-48" />
          </Card>
        ) : notFound ? (
          <Card>
            <EmptyState
              icon={Users}
              headingLevel={2}
              title="Group not found"
              description="It may have been deleted, or you're not a member."
              action={
                <ButtonLink to="/groups" variant="secondary" size="sm">
                  Back to groups
                </ButtonLink>
              }
            />
          </Card>
        ) : (
          <ErrorState message={group.error.message} onRetry={() => void group.refetch()} />
        )}
      </PageContainer>
    );
  }

  const data = group.data;
  const isAdmin = data.myRole === 'owner' || data.myRole === 'admin';
  const act = (kind, member) => {
    if (kind === 'promote') {
      run(
        () => groupsApi.changeRole(groupId, member.user.id, 'admin'),
        `${member.user.displayName} is now an admin`,
      );
    } else if (kind === 'demote') {
      run(() => groupsApi.changeRole(groupId, member.user.id, 'member'), 'Admin role removed');
    } else {
      setConfirm({ kind, member });
    }
  };

  const confirmText = {
    remove: (m) => ({
      title: `Remove ${m.user.displayName}?`,
      body: "They'll leave the group and lose access to its messages and files.",
      action: 'Remove',
      run: () =>
        run(
          () => groupsApi.removeMember(groupId, m.user.id),
          'Member removed',
          () => setConfirm(null),
        ),
    }),
    transfer: (m) => ({
      title: `Make ${m.user.displayName} the owner?`,
      body: 'You will become an admin. Only the owner can delete the group or change roles.',
      action: 'Transfer ownership',
      run: () =>
        run(
          () => groupsApi.transferOwnership(groupId, m.user.id),
          'Ownership transferred',
          () => setConfirm(null),
        ),
    }),
    leave: () => ({
      title: 'Leave this group?',
      body:
        data.myRole === 'owner' && data.memberCount === 1
          ? "You're the only member, so leaving deletes the group."
          : "You'll lose access to its messages and files. An admin can add you again.",
      action: 'Leave group',
      run: () =>
        run(
          () => groupsApi.removeMember(groupId, user.id),
          'You left the group',
          () => void navigate('/groups'),
        ),
    }),
    delete: () => ({
      title: 'Delete this group for everyone?',
      body: 'All members lose access to its messages and files. This cannot be undone.',
      action: 'Delete group',
      run: () =>
        run(
          () => groupsApi.deleteGroup(groupId),
          'Group deleted',
          () => void navigate('/groups'),
        ),
    }),
  };
  const dialog = confirm ? confirmText[confirm.kind](confirm.member) : null;
  const ownerMustTransfer = data.myRole === 'owner' && data.memberCount > 1;

  return (
    <PageContainer width="lg">
      <PageHeader title={data.name} backTo={{ to: '/groups', label: 'Groups' }} />
      {data.suspended ? (
        <Alert tone="warning" title="This group is suspended by a moderator" className="mb-6">
          Members can read its history, but nobody can post, join, invite or change it.
        </Alert>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <Card>
            <div className="flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:items-start sm:text-left">
              <Avatar name={data.name} src={data.avatarUrl ?? undefined} size="xl" decorative />
              <div className="min-w-0 flex-1">
                {editing ? (
                  <form
                    className="space-y-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      run(
                        () => groupsApi.updateGroup(groupId, draft),
                        'Group updated',
                        () => setEditing(false),
                      );
                    }}
                  >
                    <Input
                      aria-label="Group name"
                      value={draft.name}
                      maxLength={LIMITS.groupNameMaxLength}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    />
                    <Textarea
                      aria-label="Description"
                      rows={2}
                      value={draft.description}
                      maxLength={LIMITS.groupDescriptionMaxLength}
                      onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                    />
                    <div className="flex gap-2">
                      <Button type="submit" size="sm" loading={mutation.isPending}>
                        Save
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <>
                    <h2 className="text-lg font-semibold break-words text-ink">{data.name}</h2>
                    <p className="text-sm break-words whitespace-pre-line text-ink-muted">
                      {data.description || 'No description'}
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">
                      {data.memberCount} {data.memberCount === 1 ? 'member' : 'members'} · you are{' '}
                      {data.myRole === 'member' ? 'a member' : `the ${data.myRole}`}
                    </p>
                  </>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <ButtonLink to={`/chats/${groupId}`} icon={MessageCircle}>
                  Open chat
                </ButtonLink>
                {isAdmin && !editing ? (
                  <>
                    <Button
                      variant="secondary"
                      icon={Pencil}
                      onClick={() => {
                        setDraft({ name: data.name, description: data.description });
                        setEditing(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="secondary"
                      icon={ImageUp}
                      onClick={() => fileRef.current?.click()}
                    >
                      Change photo
                    </Button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      aria-hidden="true"
                      tabIndex={-1}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = '';
                        if (file)
                          run(() => groupsApi.uploadGroupAvatar(groupId, file), 'Photo updated');
                      }}
                    />
                  </>
                ) : null}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Members"
              action={
                isAdmin ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={UserPlus}
                    onClick={() => setAdding(true)}
                  >
                    Add
                  </Button>
                ) : null
              }
            />
            <ul className="divide-y divide-border" aria-label="Members">
              {data.members.map((member) => {
                const items = memberItems(member, { myRole: data.myRole, selfId: user.id }, act);
                const badge = ROLE_BADGE[member.role];
                return (
                  <li key={member.user.id} className="flex items-center gap-3 px-5 py-3">
                    <Avatar
                      name={member.user.displayName}
                      src={member.user.avatarUrl ?? undefined}
                      decorative
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">
                        {member.user.displayName}
                        {member.user.id === user.id ? ' (you)' : ''}
                      </span>
                      <span className="block truncate text-xs text-ink-muted">
                        @{member.user.username}
                      </span>
                    </span>
                    {badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : null}
                    {items.length ? (
                      <DropdownMenu
                        label={`Options for ${member.user.displayName}`}
                        triggerClassName={buttonClasses({
                          variant: 'ghost',
                          size: 'sm',
                          iconOnly: true,
                        })}
                        trigger={<EllipsisVertical aria-hidden="true" className="size-4" />}
                        items={items}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Card>

          {isAdmin ? <GroupInvites groupId={groupId} /> : null}
        </div>

        <Card className="h-fit">
          <CardHeader title="Group actions" />
          <div className="space-y-2 p-4">
            <Button
              variant="danger"
              icon={LogOut}
              fullWidth
              disabled={ownerMustTransfer}
              onClick={() => setConfirm({ kind: 'leave' })}
            >
              Leave group
            </Button>
            {ownerMustTransfer ? (
              <p className="text-xs text-ink-muted">
                As the owner, make another member the owner before leaving.
              </p>
            ) : null}
            {data.myRole === 'owner' ? (
              <Button
                variant="danger"
                icon={Trash2}
                fullWidth
                onClick={() => setConfirm({ kind: 'delete' })}
              >
                Delete group
              </Button>
            ) : null}
            <Button variant="secondary" icon={Flag} fullWidth onClick={() => setReporting(true)}>
              Report group
            </Button>
          </div>
        </Card>
      </div>

      <ReportDialog
        open={reporting}
        onClose={() => setReporting(false)}
        target={{ type: 'group', id: groupId, name: data.name }}
      />
      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="Add members"
        description="You can add people you're connected with."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
              disabled={toAdd.length === 0}
              loading={mutation.isPending}
              onClick={() =>
                run(
                  () => groupsApi.addMembers(groupId, toAdd),
                  'Members added',
                  () => {
                    setToAdd([]);
                    setAdding(false);
                  },
                )
              }
            >
              Add
            </Button>
          </>
        }
      >
        <PeoplePicker
          selected={toAdd}
          onChange={setToAdd}
          excludeIds={data.members.map((member) => member.user.id)}
        />
      </Dialog>

      <Dialog
        open={Boolean(dialog)}
        onClose={() => setConfirm(null)}
        size="sm"
        title={dialog?.title ?? ''}
        description={dialog?.body}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={mutation.isPending} onClick={() => dialog?.run()}>
              {dialog?.action}
            </Button>
          </>
        }
      />
    </PageContainer>
  );
}
