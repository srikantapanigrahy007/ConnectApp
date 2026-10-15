import { Avatar } from '../../../components/ui/Avatar';
import { Checkbox } from '../../../components/ui/FormControls';
import { ListSkeleton } from '../../../components/ui/Skeleton';
import { useConversations } from '../../messaging/hooks';

/**
 * Choose people to add: those you have a one-to-one chat with and can message (connected, no
 * block). The server applies the same rule, so nobody can be added who couldn't be messaged.
 */
export function PeoplePicker({ selected, onChange, excludeIds = [] }) {
  const conversations = useConversations();
  const people = (conversations.data?.pages ?? [])
    .flatMap((page) => page.items)
    .filter((c) => c.type !== 'group' && c.peer && c.canMessage && !excludeIds.includes(c.peer.id))
    .map((c) => c.peer);

  if (conversations.isPending) return <ListSkeleton rows={3} label="Loading people…" />;
  if (people.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        Nobody to add yet. You can add people you're connected with and have chatted with.
      </p>
    );
  }
  const toggle = (id) =>
    onChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);
  return (
    <ul className="max-h-60 space-y-1 overflow-y-auto" aria-label="People">
      {people.map((person) => (
        <li key={person.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
          <Avatar
            name={person.displayName}
            src={person.avatarUrl ?? undefined}
            size="sm"
            decorative
          />
          <Checkbox
            label={`${person.displayName} (@${person.username})`}
            checked={selected.includes(person.id)}
            onChange={() => toggle(person.id)}
          />
        </li>
      ))}
    </ul>
  );
}
