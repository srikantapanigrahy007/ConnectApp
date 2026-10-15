import { Copy, Link2, Plus, Ticket } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card, CardHeader } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Select } from '../../../components/ui/FormControls';
import { ListSkeleton } from '../../../components/ui/Skeleton';
import { useToast } from '../../../components/ui/toast-context';
import { ApiError } from '../../../lib/api-client';
import { formatListTimestamp } from '../../../lib/format-time';
import * as groupsApi from '../api';
import { invitesKey, useGroupMutation, useInvites } from '../hooks';
import { useQueryClient } from '@tanstack/react-query';

const EXPIRY = [
  { value: 1, label: '1 hour' },
  { value: 24, label: '1 day' },
  { value: 168, label: '7 days' },
  { value: 720, label: '30 days' },
];
const USES = [
  { value: '', label: 'No limit' },
  { value: '1', label: '1 person' },
  { value: '5', label: '5 people' },
  { value: '25', label: '25 people' },
  { value: '100', label: '100 people' },
];
const STATE = {
  active: { tone: 'success', label: 'Active' },
  expired: { tone: 'neutral', label: 'Expired' },
  exhausted: { tone: 'neutral', label: 'Used up' },
  revoked: { tone: 'danger', label: 'Revoked' },
};

/**
 * Admins create, share and revoke invitations. The link and code are shown only right after
 * creating one (the server keeps only hashes). The link carries its token after "#", so it never
 * reaches server logs.
 */
export function GroupInvites({ groupId }) {
  const invites = useInvites(groupId, true);
  const [expiresInHours, setExpiry] = useState(168);
  const [maxUses, setMaxUses] = useState('');
  const [created, setCreated] = useState(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: invitesKey(groupId) });
  const create = useGroupMutation(
    () =>
      groupsApi.createInvite(groupId, {
        expiresInHours: Number(expiresInHours),
        maxUses: maxUses ? Number(maxUses) : null,
      }),
    null,
  );
  const revoke = useGroupMutation((inviteId) => groupsApi.revokeInvite(groupId, inviteId), null);
  const failed = (error) =>
    toast({
      tone: 'danger',
      title: error instanceof ApiError ? error.message : 'Something went wrong. Try again.',
    });

  const link = created ? `${window.location.origin}/join#t=${created.token}` : '';
  const copy = (text, what) =>
    void navigator.clipboard?.writeText(text).then(
      () => toast({ title: `${what} copied` }),
      () => toast({ tone: 'danger', title: `Couldn't copy the ${what.toLowerCase()}` }),
    );

  return (
    <Card>
      <CardHeader title="Invitations" description="Anyone with a valid link or code can join." />
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-ink">
            Expires after
            <Select
              className="mt-1"
              value={expiresInHours}
              onChange={(e) => setExpiry(e.target.value)}
            >
              {EXPIRY.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-sm font-medium text-ink">
            Can be used by
            <Select className="mt-1" value={maxUses} onChange={(e) => setMaxUses(e.target.value)}>
              {USES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
          <Button
            icon={Plus}
            loading={create.isPending}
            onClick={() =>
              create.mutate(undefined, {
                onSuccess: (invite) => {
                  setCreated(invite);
                  refresh();
                  toast({ tone: 'success', title: 'Invitation created' });
                },
                onError: failed,
              })
            }
          >
            Create invitation
          </Button>
        </div>

        {created ? (
          <div
            role="status"
            className="space-y-2 rounded-xl border border-primary-200 bg-primary-50 p-3 text-sm"
          >
            <p className="font-medium text-ink">Share this now: it won't be shown again.</p>
            <div className="flex items-center gap-2">
              <Link2 aria-hidden="true" className="size-4 shrink-0 text-primary-700" />
              <code className="min-w-0 flex-1 truncate">{link}</code>
              <Button size="sm" variant="secondary" icon={Copy} onClick={() => copy(link, 'Link')}>
                Copy link
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Ticket aria-hidden="true" className="size-4 shrink-0 text-primary-700" />
              <code className="flex-1 text-base tracking-widest">{created.code}</code>
              <Button
                size="sm"
                variant="secondary"
                icon={Copy}
                onClick={() => copy(created.code, 'Code')}
              >
                Copy code
              </Button>
            </div>
          </div>
        ) : null}

        {invites.isPending ? (
          <ListSkeleton rows={2} label="Loading invitations…" />
        ) : invites.isError ? (
          <ErrorState message={invites.error.message} onRetry={() => void invites.refetch()} />
        ) : invites.data.length === 0 ? (
          <EmptyState
            icon={Ticket}
            title="No invitations yet"
            description="Create one to share a link or code."
          />
        ) : (
          <ul className="divide-y divide-border" aria-label="Invitations">
            {invites.data.map((invite) => (
              <li key={invite.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <Badge tone={STATE[invite.state].tone}>{STATE[invite.state].label}</Badge>
                <span className="min-w-0 flex-1 text-ink-muted">
                  {invite.uses}
                  {invite.maxUses ? ` of ${invite.maxUses}` : ''} used · expires{' '}
                  {formatListTimestamp(invite.expiresAt)}
                </span>
                {invite.state === 'active' ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={revoke.isPending && revoke.variables === invite.id}
                    onClick={() =>
                      revoke.mutate(invite.id, {
                        onSuccess: () => {
                          refresh();
                          toast({ title: 'Invitation revoked' });
                        },
                        onError: failed,
                      })
                    }
                  >
                    Revoke
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
