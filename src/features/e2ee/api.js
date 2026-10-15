import {
  conversationE2eeStatusSchema,
  e2eeDeviceSchema,
  e2eeKeyCountsSchema,
  e2eeServerStatusSchema,
  e2eeToDeviceSyncResponseSchema,
} from '#shared';
import { z } from 'zod';
import { apiClient, unwrap } from '../../lib/api-client';

/** HTTP calls for end-to-end encryption devices (public keys only; checkpoint B). */

const devicePath = (deviceId) => `/e2ee/devices/${encodeURIComponent(deviceId)}`;

/** Registers this browser's device with its signed public keys (idempotent). */
export async function registerDevice(deviceId, deviceKeys) {
  return unwrap(e2eeDeviceSchema, await apiClient.put(devicePath(deviceId), { deviceKeys }));
}

export async function listMyDevices() {
  return unwrap(z.array(e2eeDeviceSchema), await apiClient.get('/e2ee/devices'));
}

export async function removeDevice(deviceId) {
  await apiClient.delete(devicePath(deviceId));
}

// ── Checkpoint C: one-time keys and sessions ────────────────────────────────

/**
 * Key-exchange responses are handed to the crypto library as they are; the library itself
 * checks every signature in them. Here we only require a JSON object.
 */
const libraryResponseSchema = z.record(z.string(), z.unknown());

/** Publishes the library's KeysUpload body for this device; resolves with the key counts. */
export async function uploadKeys(deviceId, body) {
  return unwrap(e2eeKeyCountsSchema, await apiClient.post(`${devicePath(deviceId)}/keys`, body));
}

/** How many of this device's one-time keys are still unclaimed (and if its fallback key is). */
export async function keyCounts(deviceId) {
  return unwrap(e2eeKeyCountsSchema, await apiClient.get(`${devicePath(deviceId)}/keys/count`));
}

/** The library's KeysQuery: the devices (signed public keys) of the given accounts. */
export async function queryKeys(body) {
  return unwrap(libraryResponseSchema, await apiClient.post('/e2ee/keys/query', body));
}

/** The library's KeysClaim: one one-time (or fallback) key per requested device. */
export async function claimKeys(body) {
  return unwrap(libraryResponseSchema, await apiClient.post('/e2ee/keys/claim', body));
}

// ── Checkpoint D: device binding, to-device delivery, encrypted conversations ─

/** A challenge naming this sign-in and device, for the device to sign. */
export async function bindingChallenge(deviceId) {
  return unwrap(
    z.object({ challenge: z.string() }),
    await apiClient.post(`${devicePath(deviceId)}/binding-challenge`),
  ).challenge;
}

/** Binds this sign-in to the device that signed the challenge. */
export async function bindDevice(deviceId, challenge, signature) {
  await apiClient.put(`${devicePath(deviceId)}/binding`, { challenge, signature });
}

/** Sends the library's to-device request (Olm-encrypted payloads, one per device). */
export async function sendToDevice(txnId, type, messages) {
  return unwrap(
    libraryResponseSchema,
    await apiClient.put(`/e2ee/to-device/${encodeURIComponent(txnId)}`, { type, messages }),
  );
}

/** Acknowledges the bound device's queue up to `ackUpTo` and fetches what follows. */
export async function syncToDevice(deviceId, ackUpTo) {
  return unwrap(
    e2eeToDeviceSyncResponseSchema,
    await apiClient.post(`${devicePath(deviceId)}/to-device`, { ackUpTo }),
  );
}

export async function serverStatus() {
  return unwrap(e2eeServerStatusSchema, await apiClient.get('/e2ee/status'));
}

export async function conversationStatus(conversationId) {
  return unwrap(
    conversationE2eeStatusSchema,
    await apiClient.get(`/e2ee/conversations/${encodeURIComponent(conversationId)}`),
  );
}

export async function enableConversation(conversationId) {
  return unwrap(
    conversationE2eeStatusSchema,
    await apiClient.post(`/e2ee/conversations/${encodeURIComponent(conversationId)}/enable`),
  );
}
