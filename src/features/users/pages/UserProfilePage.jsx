import {
  Ban,
  Check,
  Clock,
  Compass,
  EllipsisVertical,
  Flag,
  Lock,
  MessageCircle,
  Send,
  UserRoundX,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { PageContainer, PageHeader } from '../../../components/layout/Page';
import { Avatar } from '../../../components/ui/Avatar';
import { Badge } from '../../../components/ui/Badge';
import { Button, ButtonLink } from '../../../components/ui/Button';
import { buttonClasses } from '../../../components/ui/button-styles';
import { Card } from '../../../components/ui/Card';
import { Dialog } from '../../../components/ui/Dialog';
import { DropdownMenu } from '../../../components/ui/DropdownMenu';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useToast } from '../../../components/ui/toast-context';
import { ApiError } from '../../../lib/api-client';
import { formatListTimestamp } from '../../../lib/format-time';
import { useOpenConversation } from '../../messaging/hooks';
import { ReportDialog } from '../../reports/ReportDialog';
import { SendRequestDialog } from '../../requests/components/SendRequestDialog';
import { useAnswerRequest } from '../../requests/hooks';
import { useBlockUser, useProfile, useUnblockUser } from '../hooks';

const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

function PresenceLine({ presence }) {
  if (presence.online) {
    return (
      <Badge tone="success" dot>
        Online
      </Badge>
    );
  }
  if (presence.lastSeenAt) {
    return (
      <span className="text-sm text-ink-muted">
        Last seen {formatListTimestamp(presence.lastSeenAt)}
      </span>
    );
  }
  return null;
}

/** What the viewer can do next, decided by the server's `relationship` (and re-checked on use). */
function RelationshipActions({ profile, onSendRequest }) {
  const answer = useAnswerRequest();
  const unblock = useUnblockUser();
  const openConversation = useOpenConversation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { relationship } = profile;

  const message = () =>
    openConversation.mutate(profile.id, {
      onSuccess: (conversation) => void navigate(`/chats/${conversation.id}`),
      onError: (error) =>
        toast({
          tone: 'danger',
          title: error instanceof ApiError ? error.message : "Couldn't open the conversation",
        }),
    });

  const act = (id, action, message) =>
    answer.mutate(
      { id, action },
      {
        onSuccess: () => toast({ tone: 'success', title: message }),
        onError: (error) =>
          toast({
            tone: 'danger',
            title: error instanceof ApiError ? error.message : 'Something went wrong',
          }),
      },
    );

  if (relationship.isSelf) {
    return <ButtonLink to="/profile">Edit profile</ButtonLink>;
  }
  if (relationship.blockedByYou) {
    return (
      <Button
        variant="secondary"
        loading={unblock.isPending}
        onClick={() =>
          unblock.mutate(profile.id, {
            onSuccess: () => toast({ title: `Unblocked @${profile.username}` }),
          })
        }
      >
        Unblock
      </Button>
    );
  }
  if (relationship.connected) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="success" dot>
          Connected
        </Badge>
        <Button icon={MessageCircle} loading={openConversation.isPending} onClick={message}>
          Message
        </Button>
      </div>
    );
  }
  if (relationship.incomingRequest) {
    const { id } = relationship.incomingRequest;
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          icon={Check}
          loading={answer.isPending}
          onClick={() => act(id, 'accept', 'Request accepted')}
        >
          Accept request
        </Button>
        <Button
          variant="secondary"
          icon={X}
          disabled={answer.isPending}
          onClick={() => act(id, 'reject', 'Request rejected')}
        >
          Reject
        </Button>
      </div>
    );
  }
  if (relationship.outgoingRequest?.status === 'pending') {
    const { id } = relationship.outgoingRequest;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="primary">
          <Clock aria-hidden="true" className="size-3.5" /> Request sent
        </Badge>
        <Button
          variant="secondary"
          size="sm"
          loading={answer.isPending}
          onClick={() => act(id, 'cancel', 'Request cancelled')}
        >
          Cancel request
        </Button>
      </div>
    );
  }
  if (relationship.canSendRequest) {
    return (
      <Button icon={Send} onClick={onSendRequest}>
        Send message request
      </Button>
    );
  }
  return (
    <p className="text-sm text-ink-muted">@{profile.username} isn’t accepting message requests.</p>
  );
}

function ProfileSkeleton() {
  return (
    <Card className="p-6" role="status">
      <span className="sr-only">Loading profile…</span>
      <div className="flex items-center gap-4">
        <Skeleton className="size-24 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
    </Card>
  );
}

/** Another person's profile at /users/:username. */
export function UserProfilePage() {
  const { username = '' } = useParams();
  const profile = useProfile(username.toLowerCase());
  const [requestOpen, setRequestOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const block = useBlockUser();
  const { toast } = useToast();

  const notFound =
    profile.error instanceof ApiError &&
    (profile.error.status === 404 || profile.error.status === 400);
  const data = profile.data;

  return (
    <PageContainer>
      <PageHeader
        title={data ? data.displayName : 'Profile'}
        documentTitle={data ? `@${data.username}` : 'Profile'}
        backTo={{ to: '/discover', label: 'Discover' }}
      />
      {profile.isPending ? (
        <ProfileSkeleton />
      ) : notFound ? (
        <Card>
          <EmptyState
            icon={UserRoundX}
            headingLevel={2}
            title={`We couldn't find @${username}`}
            description="The username may be wrong, or the account isn't available."
            action={
              <ButtonLink to="/discover" variant="secondary" size="sm" icon={Compass}>
                Discover people
              </ButtonLink>
            }
          />
        </Card>
      ) : profile.isError ? (
        <ErrorState
          message={profile.error.message}
          onRetry={() => void profile.refetch()}
          isRetrying={profile.isFetching}
        />
      ) : (
        <div className="space-y-6">
          <Card>
            <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-start">
              <Avatar
                name={data.displayName}
                src={data.avatarUrl ?? undefined}
                size="xl"
                decorative
              />
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink-muted">@{data.username}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <PresenceLine presence={data.presence} />
                      {data.profileVisibility === 'private' ? (
                        <Badge>
                          <Lock aria-hidden="true" className="size-3.5" /> Private profile
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  {!data.relationship.isSelf ? (
                    <DropdownMenu
                      label="More options"
                      triggerClassName={buttonClasses({ variant: 'ghost', iconOnly: true })}
                      trigger={<EllipsisVertical aria-hidden="true" className="size-5" />}
                      items={[
                        { label: 'Report…', icon: Flag, onSelect: () => setReportOpen(true) },
                        data.relationship.blockedByYou
                          ? null
                          : {
                              label: `Block @${data.username}`,
                              icon: Ban,
                              tone: 'danger',
                              onSelect: () => setBlockOpen(true),
                            },
                      ].filter(Boolean)}
                    />
                  ) : null}
                </div>

                {data.access === 'full' ? (
                  <>
                    {data.bio ? (
                      <p className="text-sm whitespace-pre-line text-ink">{data.bio}</p>
                    ) : null}
                    {data.joinedAt ? (
                      <p className="text-sm text-ink-muted">
                        Joined {dateFormat.format(new Date(data.joinedAt))}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-ink-muted">
                    This profile is private. Connect with @{data.username} to see more.
                  </p>
                )}

                <RelationshipActions profile={data} onSendRequest={() => setRequestOpen(true)} />
              </div>
            </div>
          </Card>

          <SendRequestDialog open={requestOpen} onClose={() => setRequestOpen(false)} user={data} />
          <ReportDialog
            open={reportOpen}
            onClose={() => setReportOpen(false)}
            target={{ type: 'user', id: data.id, name: `@${data.username}` }}
          />
          <Dialog
            open={blockOpen}
            onClose={() => setBlockOpen(false)}
            title={`Block @${data.username}?`}
            description="They won't be able to find your profile, send you requests or message you. Any pending requests between you are cancelled. They aren't told that you blocked them."
            footer={
              <>
                <Button variant="secondary" onClick={() => setBlockOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  loading={block.isPending}
                  onClick={() =>
                    block.mutate(data.username, {
                      onSuccess: () => {
                        setBlockOpen(false);
                        toast({ title: `Blocked @${data.username}` });
                      },
                    })
                  }
                >
                  Block
                </Button>
              </>
            }
          />
        </div>
      )}
    </PageContainer>
  );
}
