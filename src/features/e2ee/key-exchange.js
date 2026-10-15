import * as api from './api';
import { cryptoRuntime, matrixUserId } from './crypto-runtime';
import { registerCurrentDevice } from './device-registration';

/**
 * Key exchange (Phase 15, Stage B, checkpoint C): publishing this device's one-time keys and
 * setting up Olm sessions with other people's devices. It never opens a device itself: every
 * function works on the device already open in the runtime and does nothing otherwise.
 *
 * The crypto library (18.9.0) decides what to upload and whom to claim keys for; this module only
 * carries its requests to the API and its responses back. A request is acknowledged to the
 * library (`markRequestAsSent`) only after the API accepted it, so a failed upload is offered
 * again, with the same keys, next time.
 */

const loadLibrary = () => import('@matrix-org/matrix-sdk-crypto-wasm');

/** Enough for every request the library queues at once (it uploads at most 50 keys at a time). */
const MAX_ROUNDS = 5;

/**
 * One library operation at a time per device: key exchange, room-key sharing, to-device
 * processing and encryption share the library's request queue (and `shareRoomKey` must not run
 * twice at once for a room).
 */
const queues = new WeakMap();
export function withDevice(machine, task) {
  const run = (queues.get(machine) ?? Promise.resolve()).then(task, task);
  queues.set(
    machine,
    run.catch(() => undefined),
  );
  return run;
}

function openDevice(runtime) {
  const state = runtime.getState();
  const machine = runtime.getMachine();
  return state.status === 'ready' && machine ? { state, machine } : null;
}

/** The API's error code, or a fixed code (error messages may describe key material). */
const reasonOf = (error) =>
  typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code)
    ? error.code
    : 'unexpected_error';

async function pendingRequest(machine, type) {
  return (await machine.outgoingRequests()).find((request) => request.type === type);
}

/** Sends pending key uploads (call inside `withDevice`). */
export async function sendUploads(library, runtime, { state, machine }) {
  let uploaded = 0;
  let registered = false;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const request = await pendingRequest(machine, library.RequestType.KeysUpload);
    if (!request) return { status: 'up_to_date', uploaded };
    let counts;
    try {
      counts = await api.uploadKeys(state.deviceId, JSON.parse(request.body));
    } catch (error) {
      if (reasonOf(error) !== 'DEVICE_NOT_REGISTERED' || registered) {
        return { status: 'failed', reason: reasonOf(error), uploaded };
      }
      // Registered once (checkpoint B), then the same upload is sent again.
      registered = true;
      try {
        const registration = await registerCurrentDevice(runtime);
        if (!registration.registered) {
          return { status: 'failed', reason: registration.reason, uploaded };
        }
        counts = await api.uploadKeys(state.deviceId, JSON.parse(request.body));
      } catch (retryError) {
        return { status: 'failed', reason: reasonOf(retryError), uploaded };
      }
    }
    await machine.markRequestAsSent(request.id, request.type, JSON.stringify(counts));
    uploaded += 1;
  }
  return { status: 'incomplete', uploaded };
}

/**
 * Publishes whatever keys the library has waiting: on first use the 50 signed one-time keys
 * (and registers the device if the server doesn't know it), later top-ups and fallback keys.
 *
 * @returns {Promise<{ status: 'up_to_date' | 'incomplete' | 'failed', uploaded: number, reason?: string }>}
 */
export async function uploadDeviceKeys(runtime = cryptoRuntime) {
  const open = openDevice(runtime);
  if (!open) return { status: 'failed', reason: 'device_not_open', uploaded: 0 };
  const library = await loadLibrary();
  return withDevice(open.machine, () => sendUploads(library, runtime, open));
}

/**
 * Tells the library how many of its one-time keys are still unclaimed on the server and whether
 * its fallback key is still unused; the library then makes new keys as needed, and they are
 * uploaded. (The server can't push this yet; callers decide when to check.)
 */
export async function syncKeyCounts(runtime = cryptoRuntime) {
  const open = openDevice(runtime);
  if (!open) return { status: 'failed', reason: 'device_not_open', uploaded: 0 };
  const library = await loadLibrary();
  return withDevice(open.machine, async () => {
    let counts;
    try {
      counts = await api.keyCounts(open.state.deviceId);
    } catch (error) {
      // Not registered yet: uploading registers it.
      if (reasonOf(error) === 'DEVICE_NOT_REGISTERED') return sendUploads(library, runtime, open);
      return { status: 'failed', reason: reasonOf(error), uploaded: 0 };
    }
    await open.machine.receiveSyncChanges(
      '[]',
      new library.DeviceLists(),
      new Map(Object.entries(counts.one_time_key_counts)),
      new Set(counts.unused_fallback_key_types ?? []),
    );
    return sendUploads(library, runtime, open);
  });
}

/** Sends the library's pending key queries (device lists) and hands back the answers. */
export async function sendQueries(library, machine) {
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const request = await pendingRequest(machine, library.RequestType.KeysQuery);
    if (!request) return;
    const response = await api.queryKeys(JSON.parse(request.body));
    await machine.markRequestAsSent(request.id, request.type, JSON.stringify(response));
  }
}

const deviceKey = (userId, deviceId) => `${userId}|${deviceId}`;
const claimedDevices = (oneTimeKeys) =>
  new Set(
    Object.entries(oneTimeKeys ?? {}).flatMap(([userId, devices]) =>
      Object.keys(devices ?? {}).map((deviceId) => deviceKey(userId, deviceId)),
    ),
  );

/**
 * Makes sure this device has an Olm session with every device of `userIds` (Connect user ids):
 * refreshes their devices' public keys, claims one key for each device without a session, and
 * reports per device what the claim did.
 *
 * Statuses: key_claimed (a key was claimed and handed to the library), no_one_time_key (the
 * server had no key left for it), not_requested (the library asked for nothing: it already has a
 * session, or it is backing off after an earlier failure). The library offers no way to inspect
 * sessions, and no check here spends a message to find out: whether a session really works shows
 * when a message is encrypted for that device (encryption skips devices without one).
 * `verified` is the library's verdict and stays false until devices are verified (checkpoint F):
 * a session proves only that the keys were validly signed by that device, not whose device it is.
 *
 * @param {string[]} userIds
 * @returns {Promise<{ status: 'done', devices: Array<{ userId: string, deviceId: string, status: string, verified: boolean }> } | { status: 'failed', reason: string, devices: [] }>}
 */
export async function establishSessions(userIds, runtime = cryptoRuntime) {
  const open = openDevice(runtime);
  if (!open) return { status: 'failed', reason: 'device_not_open', devices: [] };
  const library = await loadLibrary();
  const ids = [...new Set(userIds)];
  // The library consumes UserId objects passed in arrays: fresh ones for every call.
  const userIdObjects = () => ids.map((id) => new library.UserId(matrixUserId(id)));
  const { state, machine } = open;

  return withDevice(machine, async () => {
    let requested = new Set();
    let claimed = new Set();
    try {
      await machine.updateTrackedUsers(userIdObjects());
      await sendQueries(library, machine);
      const claim = await machine.getMissingSessions(userIdObjects());
      if (claim) {
        requested = claimedDevices(JSON.parse(claim.body).one_time_keys);
        const response = await api.claimKeys(JSON.parse(claim.body));
        claimed = claimedDevices(response.one_time_keys);
        await machine.markRequestAsSent(claim.id, claim.type, JSON.stringify(response));
      }
    } catch (error) {
      return { status: 'failed', reason: reasonOf(error), devices: [] };
    }

    const devices = [];
    for (const id of ids) {
      const userDevices = await machine.getUserDevices(new library.UserId(matrixUserId(id)));
      for (const device of userDevices.devices()) {
        const deviceId = device.deviceId.toString();
        if ((id === state.userId && deviceId === state.deviceId) || device.isDeleted()) continue;
        const key = deviceKey(matrixUserId(id), deviceId);
        let status = 'not_requested';
        if (claimed.has(key)) status = 'key_claimed';
        else if (requested.has(key)) status = 'no_one_time_key';
        devices.push({ userId: id, deviceId, status, verified: device.isVerified() });
      }
    }
    return { status: 'done', devices };
  });
}
