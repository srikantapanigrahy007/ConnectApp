import { Badge } from '../../../components/ui/Badge';
import { ACCOUNT_STATUS, AUDIT_ACTION_LABELS, formatDateTime, ROLE_LABELS } from '../labels';

const SETTING_LABELS = {
  registrationEnabled: 'registration',
  uploadMaxBytes: 'upload size',
  groupMaxMembers: 'group size',
  maintenanceBanner: 'maintenance banner',
};

function describeDetails(action, details) {
  if (!details) return null;
  if (details.from && details.to) {
    const labels = action === 'user.role_change' ? ROLE_LABELS : null;
    const label = (value) => labels?.[value] ?? ACCOUNT_STATUS[value]?.label ?? value;
    return `${label(details.from)} → ${label(details.to)}`;
  }
  if (typeof details.sessions === 'number') return `${details.sessions} session(s)`;
  if (details.before && details.after) {
    const changed = Object.keys(details.after).filter(
      (key) => JSON.stringify(details.before[key]) !== JSON.stringify(details.after[key]),
    );
    return changed.length
      ? `Changed ${changed.map((key) => SETTING_LABELS[key] ?? key).join(', ')}`
      : null;
  }
  return null;
}

/** One audit log row: what, who, when, why and whether it was allowed. */
export function AuditEntry({ entry, showTarget = false }) {
  const extra = describeDetails(entry.action, entry.details);
  return (
    <div className="space-y-1 px-5 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink">
          {AUDIT_ACTION_LABELS[entry.action] ?? entry.action}
        </span>
        {entry.outcome === 'denied' ? <Badge tone="danger">Denied</Badge> : null}
        <span className="ml-auto text-xs text-ink-muted">
          <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
        </span>
      </div>
      <p className="text-xs text-ink-muted">
        by {entry.actor ? `${entry.actor.displayName} (@${entry.actor.username})` : 'system'}
        {entry.actorRole ? ` · ${ROLE_LABELS[entry.actorRole] ?? entry.actorRole}` : ''}
        {showTarget && entry.targetId ? ` · ${entry.targetType} ${entry.targetId}` : ''}
        {extra ? ` · ${extra}` : ''}
      </p>
      {entry.reason ? <p className="break-words text-ink">“{entry.reason}”</p> : null}
    </div>
  );
}
