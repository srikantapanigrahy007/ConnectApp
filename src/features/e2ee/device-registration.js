import { toE2eeUserId } from '#shared';
import * as api from './api';
import { cryptoRuntime } from './crypto-runtime';

/**
 * Device registration (Phase 15, Stage B, checkpoint B). Publishes the PUBLIC identity keys of
 * the device that is already open in the runtime; it never opens a device itself and nothing in
 * the app calls it yet (E2EE stays off).
 *
 * The crypto library (18.9.0) offers no call that returns a device's signed key object on its
 * own: it appears in the device's pending KeysUpload request, bundled with one-time keys. We take
 * only `device_keys` from it, check it against the device's own identity keys, and send just that.
 * The request is NOT marked as sent, so the library keeps its one-time keys unpublished (they
 * belong to checkpoint C) and offers the same signed keys again next time.
 */

/** The library's numeric request type for key uploads (`RequestType.KeysUpload`). */
async function keysUploadType() {
  const { RequestType } = await import('@matrix-org/matrix-sdk-crypto-wasm');
  return RequestType.KeysUpload;
}

/**
 * The open device's signed public key object, verified to belong to this account and device.
 * Throws when the library has none to offer or it doesn't match the device.
 */
export async function signedDeviceKeys(machine, { userId, deviceId }) {
  const uploadType = await keysUploadType();
  const upload = (await machine.outgoingRequests()).find((request) => request.type === uploadType);
  if (!upload) throw new Error('keys_unavailable');
  const deviceKeys = JSON.parse(upload.body).device_keys;
  const matches =
    deviceKeys &&
    deviceKeys.user_id === toE2eeUserId(userId) &&
    deviceKeys.device_id === deviceId &&
    deviceKeys.keys?.[`ed25519:${deviceId}`] === machine.identityKeys.ed25519.toBase64() &&
    deviceKeys.keys?.[`curve25519:${deviceId}`] === machine.identityKeys.curve25519.toBase64();
  if (!matches) throw new Error('keys_mismatch');
  return deviceKeys;
}

/**
 * Registers the runtime's open device with the server.
 *
 * @returns {Promise<{ registered: true, device: object } | { registered: false, reason: string }>}
 *   reasons: device_not_open, keys_unavailable, keys_mismatch (the API's own refusals throw).
 */
export async function registerCurrentDevice(runtime = cryptoRuntime) {
  const state = runtime.getState();
  const machine = runtime.getMachine();
  if (state.status !== 'ready' || !machine) return { registered: false, reason: 'device_not_open' };
  let deviceKeys;
  try {
    deviceKeys = await signedDeviceKeys(machine, state);
  } catch (error) {
    const reason = ['keys_unavailable', 'keys_mismatch'].includes(error?.message)
      ? error.message
      : 'keys_unavailable';
    return { registered: false, reason };
  }
  return { registered: true, device: await api.registerDevice(state.deviceId, deviceKeys) };
}
