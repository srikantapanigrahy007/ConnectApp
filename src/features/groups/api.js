import {
  createdInviteSchema,
  groupInviteSchema,
  groupSchema,
  invitePreviewSchema,
  pollSchema,
} from '#shared';
import { z } from 'zod';
import { apiClient, unwrap } from '../../lib/api-client';

/** HTTP calls for groups, invitations and poll votes. Components use ./hooks.js instead. */

const groupPath = (id) => `/groups/${encodeURIComponent(id)}`;
const summarySchema = groupSchema.omit({ members: true, createdAt: true });

export async function listGroups() {
  return unwrap(z.array(summarySchema), await apiClient.get('/groups'));
}

/** @param {{ name: string, description?: string, memberIds?: string[] }} input */
export async function createGroup(input) {
  return unwrap(groupSchema, await apiClient.post('/groups', input));
}

export async function getGroup(id) {
  return unwrap(groupSchema, await apiClient.get(groupPath(id)));
}

export async function updateGroup(id, changes) {
  return unwrap(groupSchema, await apiClient.patch(groupPath(id), changes));
}

export async function deleteGroup(id) {
  await apiClient.delete(groupPath(id));
}

/** @param {File} file */
export async function uploadGroupAvatar(id, file) {
  const form = new FormData();
  form.append('avatar', file);
  return unwrap(groupSchema, await apiClient.put(`${groupPath(id)}/avatar`, form));
}

export async function removeGroupAvatar(id) {
  return unwrap(groupSchema, await apiClient.delete(`${groupPath(id)}/avatar`));
}

export async function addMembers(id, userIds) {
  return unwrap(groupSchema, await apiClient.post(`${groupPath(id)}/members`, { userIds }));
}

/** Removes a member, or leaves the group when `userId` is yourself. */
export async function removeMember(id, userId) {
  return unwrap(
    z.object({ left: z.boolean(), deleted: z.boolean() }),
    await apiClient.delete(`${groupPath(id)}/members/${encodeURIComponent(userId)}`),
  );
}

/** @param {'admin' | 'member'} role */
export async function changeRole(id, userId, role) {
  return unwrap(
    groupSchema,
    await apiClient.patch(`${groupPath(id)}/members/${encodeURIComponent(userId)}`, { role }),
  );
}

export async function transferOwnership(id, userId) {
  return unwrap(groupSchema, await apiClient.post(`${groupPath(id)}/transfer`, { userId }));
}

export async function listInvites(id) {
  return unwrap(z.array(groupInviteSchema), await apiClient.get(`${groupPath(id)}/invites`));
}

/** @param {{ expiresInHours: number, maxUses: number | null }} options */
export async function createInvite(id, options) {
  return unwrap(createdInviteSchema, await apiClient.post(`${groupPath(id)}/invites`, options));
}

export async function revokeInvite(id, inviteId) {
  return unwrap(
    groupInviteSchema,
    await apiClient.delete(`${groupPath(id)}/invites/${encodeURIComponent(inviteId)}`),
  );
}

/** @param {{ token?: string, code?: string }} secret */
export async function previewInvite(secret) {
  return unwrap(invitePreviewSchema, await apiClient.post('/group-invites/preview', secret));
}

export async function joinInvite(secret) {
  return unwrap(
    z.object({ groupId: z.string(), alreadyMember: z.boolean() }),
    await apiClient.post('/group-invites/join', secret),
  );
}

const pollPath = (conversationId, pollId) =>
  `/conversations/${encodeURIComponent(conversationId)}/polls/${encodeURIComponent(pollId)}`;

export async function vote(conversationId, pollId, optionIds) {
  return unwrap(
    pollSchema,
    await apiClient.put(`${pollPath(conversationId, pollId)}/vote`, { optionIds }),
  );
}

export async function retractVote(conversationId, pollId) {
  return unwrap(pollSchema, await apiClient.delete(`${pollPath(conversationId, pollId)}/vote`));
}

export async function closePoll(conversationId, pollId) {
  return unwrap(pollSchema, await apiClient.post(`${pollPath(conversationId, pollId)}/close`));
}
