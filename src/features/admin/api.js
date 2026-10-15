import { apiClient } from '../../lib/api-client';

/**
 * HTTP calls for the admin panel. Responses are admin-only views built by the API; the server
 * checks the caller's permission on every call (hiding UI is never the protection).
 */

const data = (response) => response.data.data;
const page = (response) => ({ items: response.data.data, meta: response.data.meta });
const clean = (params) =>
  Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== '' && value !== null,
    ),
  );

export const getAdminMe = async () => data(await apiClient.get('/admin/me'));
export const getDashboard = async (days) =>
  data(await apiClient.get('/admin/dashboard', { params: { days } }));
export const getSystem = async () => data(await apiClient.get('/admin/system'));

export const listUsers = async (query) =>
  page(await apiClient.get('/admin/users', { params: clean(query) }));
export const getUser = async (id) =>
  data(await apiClient.get(`/admin/users/${encodeURIComponent(id)}`));
/** @param {'suspend' | 'restore' | 'ban' | 'unban'} action */
export const moderateUser = async (id, action, reason) =>
  data(await apiClient.post(`/admin/users/${encodeURIComponent(id)}/${action}`, { reason }));
export const revokeSessions = async (id, reason) =>
  data(await apiClient.post(`/admin/users/${encodeURIComponent(id)}/revoke-sessions`, { reason }));

export const listGroups = async (query) =>
  page(await apiClient.get('/admin/groups', { params: clean(query) }));
export const getGroup = async (id) =>
  data(await apiClient.get(`/admin/groups/${encodeURIComponent(id)}`));
/** @param {'suspend' | 'unsuspend' | 'remove'} action */
export const moderateGroup = async (id, action, reason) =>
  data(await apiClient.post(`/admin/groups/${encodeURIComponent(id)}/${action}`, { reason }));

export const listReports = async (query) =>
  page(await apiClient.get('/admin/reports', { params: clean(query) }));
export const getReport = async (id) =>
  data(await apiClient.get(`/admin/reports/${encodeURIComponent(id)}`));
export const decideReport = async (id, decision) =>
  data(await apiClient.patch(`/admin/reports/${encodeURIComponent(id)}`, decision));

export const listAdmins = async () => data(await apiClient.get('/admin/roles'));
export const changeRole = async (userId, role, reason) =>
  data(await apiClient.put(`/admin/roles/${encodeURIComponent(userId)}`, { role, reason }));

export const listAudit = async (query) =>
  page(await apiClient.get('/admin/audit', { params: clean(query) }));

export const getSettings = async () => data(await apiClient.get('/admin/settings'));
export const updateSettings = async (changes) =>
  data(await apiClient.put('/admin/settings', changes));
