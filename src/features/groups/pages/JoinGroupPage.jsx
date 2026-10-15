import { inviteSecretSchema } from '#shared';
import { Ticket, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { PageContainer, PageHeader } from '../../../components/layout/Page';
import { Avatar } from '../../../components/ui/Avatar';
import { Button, ButtonLink } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { useToast } from '../../../components/ui/toast-context';
import { ApiError } from '../../../lib/api-client';
import * as groupsApi from '../api';
import { useGroupMutation } from '../hooks';

/** The token from an invitation link (/join#t=…), read once and removed from the address bar. */
function readLinkToken(hash) {
  const token = new URLSearchParams(hash.replace(/^#/, '')).get('t');
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

/**
 * /join: preview an invitation (link token or code) and join. The server validates the
 * invitation again when joining (expiry, revocation, usage limit, blocks).
 */
export function JoinGroupPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [code, setCode] = useState('');
  const [secret, setSecret] = useState(() => {
    const token = readLinkToken(location.hash);
    return token ? { token } : null;
  });
  const [formError, setFormError] = useState(null);
  const [joinError, setJoinError] = useState(null);
  const join = useGroupMutation((value) => groupsApi.joinInvite(value), null);
  const previewQuery = useQuery({
    queryKey: ['groups', 'invite-preview', secret],
    queryFn: () => groupsApi.previewInvite(secret),
    enabled: Boolean(secret),
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  const preview = previewQuery.data ?? null;
  const loading = Boolean(secret) && previewQuery.isFetching;
  const error =
    formError ??
    joinError ??
    (previewQuery.isError
      ? previewQuery.error instanceof ApiError
        ? previewQuery.error.message
        : "Couldn't check the invitation."
      : null);

  useEffect(() => {
    // Keep the secret out of history and any later screenshots of the address bar.
    if (location.hash) window.history.replaceState(null, '', location.pathname);
  }, [location.hash, location.pathname]);

  const submitCode = (event) => {
    event.preventDefault();
    const parsed = inviteSecretSchema.safeParse({ code });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Enter an invitation code');
      return;
    }
    setFormError(null);
    setJoinError(null);
    setSecret({ code });
  };

  return (
    <PageContainer>
      <PageHeader title="Join a group" backTo={{ to: '/groups', label: 'Groups' }} />
      <Card className="space-y-4 p-6">
        {!secret || error ? (
          <form onSubmit={submitCode} className="flex flex-wrap items-end gap-2">
            <label className="min-w-48 flex-1 text-sm font-medium text-ink">
              Invitation code
              <Input
                className="mt-1 uppercase tracking-widest"
                placeholder="ABCD-EFGH"
                autoComplete="off"
                maxLength={9}
                value={code}
                leadingIcon={Ticket}
                onChange={(event) => setCode(event.target.value)}
              />
            </label>
            <Button type="submit" variant="secondary" loading={loading}>
              Check code
            </Button>
          </form>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-danger-700">
            {error}
          </p>
        ) : null}
        {loading && !error ? (
          <p role="status" className="text-sm text-ink-muted">
            Checking invitation…
          </p>
        ) : null}
        {preview && !error ? (
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border p-4">
            <Avatar name={preview.name} src={preview.avatarUrl ?? undefined} size="lg" decorative />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-base font-semibold text-ink">{preview.name}</h2>
              <p className="flex items-center gap-1 text-sm text-ink-muted">
                <Users aria-hidden="true" className="size-4" /> {preview.memberCount}{' '}
                {preview.memberCount === 1 ? 'member' : 'members'}
              </p>
            </div>
            {preview.alreadyMember ? (
              <ButtonLink to={`/chats/${preview.groupId}`}>Open chat</ButtonLink>
            ) : (
              <Button
                loading={join.isPending}
                onClick={() =>
                  join.mutate(secret, {
                    onSuccess: (result) => {
                      toast({ tone: 'success', title: `You joined ${preview.name}` });
                      void navigate(`/chats/${result.groupId}`);
                    },
                    onError: (failure) =>
                      setJoinError(
                        failure instanceof ApiError ? failure.message : "Couldn't join the group.",
                      ),
                  })
                }
              >
                Join group
              </Button>
            )}
          </div>
        ) : null}
      </Card>
    </PageContainer>
  );
}
