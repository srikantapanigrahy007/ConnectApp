import {
  ArrowLeft,
  Ban,
  BellOff,
  CircleUserRound,
  EllipsisVertical,
  Flag,
  Lock,
  Star,
} from 'lucide-react';

import { Link } from 'react-router';
import { Avatar } from '../../../components/ui/Avatar';
import { buttonClasses } from '../../../components/ui/button-styles';
import { DropdownMenu } from '../../../components/ui/DropdownMenu';

/**
 * Conversation title bar. `subtitle` is announced politely (presence, "typing…") so screen
 * reader users hear changes without losing their place. Blocking happens on the profile.
 */
export function ConversationHeader({
  title,
  subtitle,
  avatarName,
  avatarUrl,
  presence,
  profileHref,
  onShowStarred,
  actionsAvailable = false,
  callActions = null,
  encrypted = false,
  onShowEncryption,
}) {
  const hint = actionsAvailable ? undefined : 'Not available yet';
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-surface px-3 sm:px-4">
      <Link
        to="/chats"
        aria-label="Back to chats"
        title="Back to chats"
        className={buttonClasses({ variant: 'ghost', iconOnly: true, className: 'md:hidden' })}
      >
        <ArrowLeft aria-hidden="true" className="size-5" />
      </Link>
      <Avatar name={avatarName} src={avatarUrl} presence={presence} decorative />
      <div className="min-w-0 flex-1">
        <h1 className="flex min-w-0 items-center gap-1.5 text-base font-semibold text-ink">
          <span className="truncate">{title}</span>
          {encrypted ? (
            <Lock
              role="img"
              aria-label="End-to-end encrypted"
              className="size-4 shrink-0 text-success-700"
            />
          ) : null}
        </h1>
        <p aria-live="polite" className="truncate text-xs text-ink-muted">
          {subtitle}
        </p>
      </div>
      {callActions}
      <DropdownMenu
        label="Conversation options"
        triggerClassName={buttonClasses({ variant: 'ghost', iconOnly: true })}
        trigger={<EllipsisVertical aria-hidden="true" className="size-5" />}
        items={[
          profileHref
            ? { label: 'View profile', icon: CircleUserRound, href: profileHref }
            : { label: 'View profile', icon: CircleUserRound, disabled: true, hint },
          ...(onShowStarred
            ? [{ label: 'Starred messages', icon: Star, onSelect: onShowStarred }]
            : []),
          ...(onShowEncryption
            ? [{ label: 'End-to-end encryption', icon: Lock, onSelect: onShowEncryption }]
            : []),
          { label: 'Mute notifications', icon: BellOff, disabled: !actionsAvailable, hint },
          { type: 'separator' },
          profileHref
            ? { label: 'Block…', icon: Ban, tone: 'danger', href: profileHref }
            : { label: 'Block', icon: Ban, tone: 'danger', disabled: true, hint },
          { label: 'Report', icon: Flag, tone: 'danger', disabled: !actionsAvailable, hint },
        ]}
      />
    </header>
  );
}
