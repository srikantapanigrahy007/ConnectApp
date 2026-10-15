import { Link } from 'react-router';
import { Avatar } from '../../../components/ui/Avatar';

/** A person in a list: avatar, name and @username linking to their profile, plus actions. */
export function UserListItem({ user, meta, actions }) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
      <Avatar name={user.displayName} src={user.avatarUrl} presence={user.presence} decorative />
      <div className="min-w-0 flex-1">
        <Link
          to={`/users/${user.username}`}
          className="block truncate rounded text-sm font-medium text-ink hover:underline"
        >
          {user.displayName}
        </Link>
        <p className="truncate text-sm text-ink-muted">@{user.username}</p>
        {meta ? <p className="mt-0.5 truncate text-xs text-ink-muted">{meta}</p> : null}
      </div>
      {actions ? <div className="flex w-full gap-2 sm:w-auto">{actions}</div> : null}
    </div>
  );
}
