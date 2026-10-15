import { blockedUserSchema, ownProfileSchema, publicProfileSchema, userCardSchema } from '#shared';
import { z } from 'zod';
import { apiClient, unwrap, unwrapPage } from '../../lib/api-client';

/** HTTP calls for profiles, search and blocking. Components use ./hooks.js instead. */

export async function getOwnProfile() {
  return unwrap(ownProfileSchema, await apiClient.get('/me/profile'));
}

/** @param {{ displayName?: string, username?: string, bio?: string, profileVisibility?: string }} changes */
export async function updateProfile(changes) {
  return unwrap(ownProfileSchema, await apiClient.patch('/me/profile', changes));
}

export async function updatePrivacy(changes) {
  return unwrap(ownProfileSchema, await apiClient.patch('/me/privacy', changes));
}

/** @param {File} file */
export async function uploadAvatar(file) {
  const form = new FormData();
  form.append('avatar', file);
  return unwrap(ownProfileSchema, await apiClient.put('/me/avatar', form));
}

export async function removeAvatar() {
  return unwrap(ownProfileSchema, await apiClient.delete('/me/avatar'));
}

export async function getProfile(username) {
  return unwrap(publicProfileSchema, await apiClient.get(`/users/${encodeURIComponent(username)}`));
}

/** @param {{ q: string, cursor?: string | null }} query */
export async function searchUsers({ q, cursor }) {
  return unwrapPage(
    userCardSchema,
    await apiClient.get('/users/search', { params: { q, ...(cursor ? { cursor } : {}) } }),
  );
}

export async function listBlocks() {
  return unwrap(z.array(blockedUserSchema), await apiClient.get('/blocks'));
}

export async function blockUser(username) {
  return unwrap(blockedUserSchema, await apiClient.post('/blocks', { username }));
}

export async function unblockUser(userId) {
  await apiClient.delete(`/blocks/${userId}`);
}
