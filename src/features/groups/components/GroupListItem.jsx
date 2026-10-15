import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { Avatar } from '../../../components/ui/Avatar';

export function GroupListItem({ group }) {
  return (
    <Link
      to={`/groups/${group.id}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-surface-muted"
    >
      <Avatar name={group.name} src={group.avatarUrl} decorative />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{group.name}</span>
        <span className="block truncate text-sm text-ink-muted">
          {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
          {group.description ? ` · ${group.description}` : ''}
        </span>
      </span>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ink-subtle" />
    </Link>
  );
}
