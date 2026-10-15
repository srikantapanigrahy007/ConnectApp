import {
  Archive,
  Compass,
  Heart,
  MailWarning,
  MessageCircle,
  Search,
  SquarePen,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useMatch, useNavigate } from 'react-router';
import { Button, ButtonLink } from '../../../components/ui/Button';
import { buttonClasses } from '../../../components/ui/button-styles';
import { Dialog } from '../../../components/ui/Dialog';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Input } from '../../../components/ui/Input';
import { ListSkeleton } from '../../../components/ui/Skeleton';
import { useToast } from '../../../components/ui/toast-context';
import { ApiError } from '../../../lib/api-client';
import { cn } from '../../../lib/cn';
import { useSession } from '../../auth/hooks';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { ConversationListItem } from '../components/ConversationListItem';
import { useConversations } from '../hooks';
import { removeConversation, updatePreferences } from '../messaging-client';
import { useMessagingStore } from '../store';
import { conversationTitle, toListItem } from '../view-models';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'favorites', label: 'Favorites' },
  { value: 'archived', label: 'Archived' },
];

const EMPTY = {
  unread: { icon: MailWarning, title: 'No unread chats', description: "You're all caught up." },
  favorites: {
    icon: Heart,
    title: 'No favorites yet',
    description: 'Add a chat to your favorites from its menu.',
  },
  archived: {
    icon: Archive,
    title: 'No archived chats',
    description: 'Archived chats stay here. A new message brings an unmuted chat back.',
  },
};

/** What each change says once the server confirmed it. */
function successMessage(change) {
  const [key, value] = Object.entries(change)[0];
  switch (key) {
    case 'pinned':
      return value ? 'Chat pinned' : 'Chat unpinned';
    case 'favorite':
      return value ? 'Added to favorites' : 'Removed from favorites';
    case 'archived':
      return value ? 'Chat archived' : 'Chat unarchived';
    case 'markedUnread':
      return value ? 'Marked as unread' : 'Marked as read';
    default:
      return value === 'off' ? 'Chat unmuted' : 'Chat muted';
  }
}

/** Delays a fast-changing value (search typing) so the server isn't asked on every key. */
function useDebounced(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function ConversationList({ filter, query, onRemove }) {
  const conversations = useConversations(filter, query);
  const { user } = useSession();
  const { toast } = useToast();
  const presence = useMessagingStore((state) => state.presence);
  const typing = useMessagingStore((state) => state.typing);

  const items = useMemo(
    () =>
      (conversations.data?.pages ?? [])
        .flatMap((page) => page.items)
        .map((conversation) => ({
          item: toListItem(conversation, {
            selfId: user?.id,
            presence: conversation.peer ? presence[conversation.peer.id] : undefined,
            typing: typing[conversation.id],
          }),
          conversation,
        })),
    [conversations.data, presence, typing, user?.id],
  );

  const act = (conversation) => (change) => {
    if (change === 'remove') {
      onRemove(conversation);
      return;
    }
    updatePreferences(conversation.id, change).then(
      () => toast({ tone: 'success', title: successMessage(change) }),
      (error) =>
        toast({
          tone: 'danger',
          title: error instanceof ApiError ? error.message : 'Something went wrong. Try again.',
        }),
    );
  };

  if (conversations.isPending) return <ListSkeleton rows={5} label="Loading conversations…" />;
  if (conversations.isError) {
    return (
      <ErrorState
        title="Couldn't load your conversations"
        message={conversations.error.message}
        onRetry={() => void conversations.refetch()}
        isRetrying={conversations.isFetching}
      />
    );
  }
  if (items.length === 0) {
    if (query) {
      return (
        <p className="px-3 py-6 text-center text-sm text-ink-muted">
          No conversations match “{query}”.
        </p>
      );
    }
    const empty = EMPTY[filter];
    return empty ? (
      <EmptyState icon={empty.icon} title={empty.title} description={empty.description} />
    ) : (
      <EmptyState
        icon={MessageCircle}
        title="No conversations yet"
        description="Connect with someone by sending a message request, then message them from their profile."
        action={
          <ButtonLink to="/discover" variant="secondary" size="sm" icon={Compass}>
            Find people
          </ButtonLink>
        }
      />
    );
  }
  return (
    <>
      <ul className="space-y-0.5" aria-label="Conversations">
        {items.map(({ item, conversation }) => (
          <li key={item.id}>
            <ConversationListItem conversation={item} onAction={act(conversation)} />
          </li>
        ))}
      </ul>
      {conversations.hasNextPage ? (
        <div className="flex justify-center py-3">
          <Button
            variant="secondary"
            size="sm"
            loading={conversations.isFetchingNextPage}
            onClick={() => void conversations.fetchNextPage()}
          >
            Show more
          </Button>
        </div>
      ) : null}
    </>
  );
}

/**
 * Two-pane messaging layout: conversation list + open conversation (tablet/desktop).
 * On mobile only one pane is shown at a time.
 */
export function MessagingLayout() {
  const openMatch = useMatch('/chats/:conversationId');
  const hasOpenConversation = openMatch !== null;
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const query = useDebounced(search.trim(), 300);
  const { toast } = useToast();
  const navigate = useNavigate();
  // The list title is the page's h1 unless a conversation (which has its own h1) is open.
  const ListHeading = hasOpenConversation ? 'h2' : 'h1';

  const confirmRemove = async () => {
    setBusy(true);
    try {
      await removeConversation(removing.id);
      toast({ tone: 'success', title: 'Chat removed from your list' });
      if (openMatch?.params.conversationId === removing.id) void navigate('/chats');
      setRemoving(null);
    } catch (error) {
      toast({
        tone: 'danger',
        title: error instanceof ApiError ? error.message : "Couldn't remove the chat. Try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full">
      <section
        aria-labelledby="chats-heading"
        className={cn(
          'w-full shrink-0 flex-col border-r border-border bg-surface md:flex md:w-80 lg:w-96',
          hasOpenConversation ? 'hidden' : 'flex',
        )}
      >
        <div className="space-y-3 border-b border-border p-4">
          <div className="flex items-center justify-between">
            <ListHeading id="chats-heading" className="text-lg font-semibold text-ink">
              Chats
            </ListHeading>
            <Link
              to="/discover"
              aria-label="New chat"
              title="New chat"
              className={buttonClasses({ variant: 'ghost', size: 'sm', iconOnly: true })}
            >
              <SquarePen aria-hidden="true" className="size-[1.125rem]" />
            </Link>
          </div>
          <Input
            type="search"
            aria-label="Search conversations by name or username"
            placeholder="Search by name or @username"
            leadingIcon={Search}
            maxLength={50}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5">
            {FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={filter === option.value}
                onClick={() => setFilter(option.value)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset',
                  filter === option.value
                    ? 'bg-primary-600 text-white ring-primary-600'
                    : 'bg-surface text-ink-muted ring-border hover:text-ink',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <ConnectionStatus />
        </div>
        <div className="relative min-h-0 flex-1 scrollbar-none overflow-y-auto overscroll-contain p-3">
          <ConversationList filter={filter} query={query} onRemove={setRemoving} />
        </div>
      </section>
      <div
        className={cn('min-w-0 flex-1 flex-col md:flex', hasOpenConversation ? 'flex' : 'hidden')}
      >
        <Outlet />
      </div>
      <Dialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        size="sm"
        title="Remove this chat from your list?"
        description={
          removing
            ? `This only hides it from your list. No messages are deleted, and ${conversationTitle(removing)} still sees the chat. It reappears when a new message arrives.`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void confirmRemove()}>
              Remove
            </Button>
          </>
        }
      />
    </div>
  );
}
