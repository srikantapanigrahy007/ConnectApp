/** Display labels and badge tones for admin screens. */

export const ROLE_LABELS = {
  user: 'User',
  super_admin: 'Super Admin',
  moderator: 'Moderator',
  support: 'Support Admin',
};

export const ACCOUNT_STATUS = {
  active: { label: 'Active', tone: 'success' },
  pending_verification: { label: 'Unverified', tone: 'neutral' },
  suspended: { label: 'Suspended', tone: 'warning' },
  banned: { label: 'Banned', tone: 'danger' },
  deactivated: { label: 'Deactivated', tone: 'neutral' },
  deleted: { label: 'Deleted', tone: 'neutral' },
};

export const GROUP_STATUS = {
  active: { label: 'Active', tone: 'success' },
  suspended: { label: 'Suspended', tone: 'warning' },
  deleted: { label: 'Removed', tone: 'neutral' },
};

export const REPORT_STATUS = {
  open: { label: 'Pending', tone: 'warning' },
  under_review: { label: 'Reviewing', tone: 'primary' },
  resolved: { label: 'Resolved', tone: 'success' },
  dismissed: { label: 'Dismissed', tone: 'neutral' },
};

export const REPORT_REASON_LABELS = {
  spam: 'Spam',
  harassment: 'Harassment or bullying',
  hate: 'Hate speech',
  violence: 'Violence or threats',
  sexual_content: 'Sexual content',
  self_harm: 'Self-harm',
  impersonation: 'Impersonation',
  other: 'Something else',
};

export const RESOLUTION_LABELS = {
  no_action: 'No action needed',
  warning: 'Warning given',
  content_removed: 'Content removed',
  user_suspended: 'User suspended',
  user_banned: 'User banned',
  group_suspended: 'Group suspended',
  group_removed: 'Group removed',
};

export const AUDIT_ACTION_LABELS = {
  'admin.bootstrap': 'Super Admin bootstrapped',
  'user.suspend': 'User suspended',
  'user.restore': 'User restored',
  'user.ban': 'User banned',
  'user.unban': 'User unbanned',
  'user.reactivate': 'User reactivated',
  'user.delete': 'User deleted',
  'user.role_change': 'Role changed',
  'session.revoke': 'Sessions revoked',
  'report.assign': 'Report taken for review',
  'report.resolve': 'Report resolved',
  'report.dismiss': 'Report dismissed',
  'report.reopen': 'Report reopened',
  'message.remove': 'Message removed',
  'group.suspend': 'Group suspended',
  'group.unsuspend': 'Group unsuspended',
  'group.remove': 'Group removed',
  'settings.update': 'Settings updated',
};

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export const formatDateTime = (iso) => (iso ? dateTime.format(new Date(iso)) : '—');
