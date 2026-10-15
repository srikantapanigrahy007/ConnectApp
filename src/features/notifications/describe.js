import {
  Bell,
  Inbox,
  MessageCircle,
  PhoneMissed,
  ShieldCheck,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';

const icons = {
  message_received: MessageCircle,
  message_request_received: Inbox,
  message_request_accepted: UserPlus,
  group_member_added: Users,
  group_member_removed: UserMinus,
  group_deleted: Trash2,
  group_role_changed: ShieldCheck,
  group_invite_used: UserPlus,
  call_missed: PhoneMissed,
};

const roleText = {
  owner: 'the owner of',
  admin: 'an admin of',
  member: 'a member of',
};

/**
 * One sentence for a notification. Built only from what the API returned (never message text),
 * so it is also safe for a system notification. A hidden actor reads as "Someone".
 *
 * @returns {{ icon: import('react').ComponentType, text: string }}
 */
export function describeNotification(notification) {
  const actor = notification.actor?.displayName ?? 'Someone';
  const group = notification.groupName ?? 'a group';
  const { count } = notification;
  let text;
  switch (notification.type) {
    case 'message_received':
      if (notification.conversationType === 'group') {
        text =
          count > 1 ? `${count} new messages in ${group}` : `${actor} sent a message in ${group}`;
      } else {
        text =
          count > 1 ? `${actor} sent you ${count} new messages` : `${actor} sent you a message`;
      }
      break;
    case 'message_request_received':
      text = `${actor} sent you a message request`;
      break;
    case 'message_request_accepted':
      text = `${actor} accepted your message request`;
      break;
    case 'group_member_added':
      text = `${actor} added you to ${group}`;
      break;
    case 'group_member_removed':
      text = notification.actor
        ? `${actor} removed you from ${group}`
        : `You were removed from ${group}`;
      break;
    case 'group_deleted':
      text = notification.actor ? `${actor} deleted ${group}` : `${group} was deleted`;
      break;
    case 'group_role_changed':
      text = `${actor} made you ${roleText[notification.role] ?? 'a member of'} ${group}`;
      break;
    case 'group_invite_used':
      text = `${actor} joined ${group} with your invitation`;
      break;
    case 'call_missed':
      text = `Missed ${notification.callType === 'video' ? 'video' : 'audio'} call from ${actor}`;
      break;
    default:
      text = 'New activity';
  }
  return { icon: icons[notification.type] ?? Bell, text };
}
