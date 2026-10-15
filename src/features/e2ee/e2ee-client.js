import { E2EE_BINDING_CHALLENGE_PATTERN, E2EE_SOCKET_EVENTS } from '#shared';
import { onRealtimeSocket } from '../../lib/realtime-socket';
import * as api from './api';
import { cryptoRuntime, e2eeUnsupportedReason, matrixUserId } from './crypto-runtime';
import { registerCurrentDevice } from './device-registration';
import { deviceStore as defaultDeviceStore } from './device-store';
import { sendQueries, sendUploads, withDevice } from './key-exchange';

/**
 * End-to-end encrypted direct messages on this browser (Phase 15, Stage B, checkpoint D).
 *
 * Opt-in: nothing loads unless the person set up encryption on this browser (a device record
 * exists here) or does so now. Then, on every start:
 * 1. the device opens (crypto-runtime.js) and proves to the server that this sign-in holds its
 *    key: it signs the server's challenge (`OlmMachine.sign`) after checking the challenge has
 *    the fixed binding format and names this device, so nothing else is ever signed;
 * 2. its to-device queue is fetched, handed to the library and acknowledged only by the next
 *    request, i.e. after the library processed it (a crash in between redelivers; verified
 *    harmless with 18.9.0). Each fetch also carries the device's one-time key counts, so the
 *    library tops its keys up without extra requests. Fetches happen on start, on every socket
 *    (re)connect, on a "to-device" hint, and (throttled) on a "keys low" hint.
 *
 * Encrypting (direct chats): the library shares the conversation's Megolm key with every device
 * of both people over Olm (to-device), then encrypts. Decrypting checks, beyond the library's own
 * authentication, that the sending device really belongs to the claimed sender (the library
 * returns the sender the server named; verified) and that the payload names the message's own
 * id (the server can't move a ciphertext to another message). Plaintext is kept in memory only.
 */

const loadLibrary = () => import('@matrix-org/matrix-sdk-crypto-wasm');

/** Queue pages one sync fetches at most before yielding (the next hint or connect continues). */
const MAX_SYNC_ROUNDS = 20;
/** "Keys low" hints refresh counts at most this often (to-device hints always sync). */
const KEYS_LOW_THROTTLE_MS = 60_000;

export const roomIdFor = (conversationId) => `!${conversationId}:connect`;

export class E2eeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'E2eeError';
    this.code = code;
  }
}

/** A fixed code for anything that went wrong (library messages may describe key material). */
const codeOf = (error) =>
  typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'E2EE_FAILED';

const IDLE = Object.freeze({ status: 'off', userId: null, deviceId: null, error: null });

/**
 * @param {{ runtime?: typeof cryptoRuntime, deviceStore?: typeof defaultDeviceStore, socketSource?: typeof onRealtimeSocket, loadLibraryFn?: () => Promise<object>, unsupportedReason?: () => string | null }} [deps]
 */
export function createE2eeClient({
  runtime = cryptoRuntime,
  deviceStore = defaultDeviceStore,
  socketSource = onRealtimeSocket,
  loadLibraryFn = loadLibrary,
  unsupportedReason = () => e2eeUnsupportedReason(),
} = {}) {
  let state = IDLE;
  let version = 0;
  const listeners = new Set();
  /** Bumped on stop: work from an older start is discarded. */
  let generation = 0;
  let stopSocket = null;

  // To-device queue position: everything up to here was processed (acknowledged next time).
  let processedSeq = 0;
  let syncing = null;
  let syncAgain = false;
  let lastKeysLowSync = 0;

  /** Decryption results by `${messageId}:${rev}`; plaintext lives only here, in memory. */
  const results = new Map();
  const inFlight = new Map();
  /** Messages whose key hasn't arrived yet: retried after every sync. */
  const waiting = new Map();
  /** `${senderId}|${clientMessageId}` → the message id it was first accepted as (replays). */
  const firstSeenAs = new Map();
  /** Users whose device lists were fetched in this session. */
  const queried = new Set();
  /** Verification flow id → the other device (to report a flow the library already finished). */
  const flowDevices = new Map();

  function emit() {
    version += 1;
    for (const listener of listeners) listener();
  }

  function setState(patch) {
    state = Object.freeze({ ...state, ...patch });
    emit();
  }

  function openMachine() {
    const machine = runtime.getMachine();
    if (state.status !== 'ready' || !machine) {
      throw new E2eeError('E2EE_NOT_READY', 'Encryption is not set up on this browser.');
    }
    return machine;
  }

  /** Proves to the server that this sign-in holds the open device's key. */
  async function bind(machine, userId, deviceId) {
    const challenge = await api.bindingChallenge(deviceId);
    const match = E2EE_BINDING_CHALLENGE_PATTERN.exec(challenge);
    // Only ever sign the fixed binding format, for this very device (never arbitrary data).
    if (!match || match[2] !== deviceId) {
      throw new E2eeError('E2EE_INVALID_CHALLENGE', 'The server sent an invalid challenge.');
    }
    const signatures = JSON.parse((await machine.sign(challenge)).asJSON());
    const signature = signatures[matrixUserId(userId)]?.[`ed25519:${deviceId}`];
    if (!signature) throw new E2eeError('E2EE_FAILED', "The device couldn't sign.");
    await api.bindDevice(deviceId, challenge, signature);
  }

  async function bindOrRegister(machine, userId, deviceId) {
    try {
      await bind(machine, userId, deviceId);
    } catch (error) {
      if (codeOf(error) !== 'DEVICE_NOT_REGISTERED') throw error;
      // First start of a new device (or it was removed on the server).
      const registration = await registerCurrentDevice(runtime);
      if (!registration.registered) {
        throw new E2eeError(
          'E2EE_DEVICE_REMOVED',
          'This browser’s encryption device was removed. Reset encryption on this browser.',
        );
      }
      await bind(machine, userId, deviceId);
    }
  }

  /** Sends a library to-device request (room keys, verification messages) through the API. */
  async function sendToDeviceRequest(machine, request) {
    const { messages } = JSON.parse(request.body);
    await api.sendToDevice(request.txn_id, request.event_type, messages);
    await machine.markRequestAsSent(request.id, request.type, '{}');
  }

  async function sendQueuedToDevice(library, machine) {
    for (const request of await machine.outgoingRequests()) {
      if (request.type === library.RequestType.ToDevice)
        await sendToDeviceRequest(machine, request);
    }
  }

  async function runSync(ownGeneration) {
    const library = await loadLibraryFn();
    const machine = runtime.getMachine();
    const { deviceId } = runtime.getState();
    if (!machine || ownGeneration !== generation) return;
    await withDevice(machine, async () => {
      for (let round = 0; round < MAX_SYNC_ROUNDS; round++) {
        // Acknowledges everything processed so far, then returns what follows.
        const data = await api.syncToDevice(deviceId, processedSeq);
        if (ownGeneration !== generation) return;
        await machine.receiveSyncChanges(
          JSON.stringify(
            data.events.map(({ sender, type, content }) => ({ sender, type, content })),
          ),
          new library.DeviceLists(),
          new Map(Object.entries(data.one_time_key_counts)),
          new Set(data.unused_fallback_key_types),
        );
        if (data.events.length === 0) break;
        processedSeq = data.events.at(-1).seq;
      }
      await sendUploads(library, runtime, { state: runtime.getState(), machine });
      await sendQueries(library, machine);
      // Replies the library queued while processing (e.g. verification MAC, done, cancel).
      await sendQueuedToDevice(library, machine);
    });
    // Keys may have arrived for messages that couldn't be decrypted yet.
    const retry = [...waiting.values()];
    waiting.clear();
    for (const message of retry) {
      results.delete(`${message.id}:${message.rev}`);
    }
    if (retry.length) emit();
  }

  /** Single flight; a request made while one runs runs once more afterwards. */
  function syncNow() {
    if (state.status !== 'ready' && state.status !== 'starting') return Promise.resolve();
    if (syncing) {
      syncAgain = true;
      return syncing;
    }
    const ownGeneration = generation;
    syncing = (async () => {
      do {
        syncAgain = false;
        await runSync(ownGeneration);
      } while (syncAgain && ownGeneration === generation);
    })()
      .catch(() => undefined) // retried on the next hint, connect or start
      .finally(() => {
        syncing = null;
      });
    return syncing;
  }

  function attachSocket() {
    stopSocket?.();
    let attached = null;
    const handlers = {
      connect: () => void syncNow(),
      [E2EE_SOCKET_EVENTS.toDevice]: ({ deviceId } = {}) => {
        if (deviceId === state.deviceId) void syncNow();
      },
      [E2EE_SOCKET_EVENTS.keysLow]: ({ deviceId } = {}) => {
        if (deviceId !== state.deviceId || Date.now() - lastKeysLowSync < KEYS_LOW_THROTTLE_MS) {
          return;
        }
        lastKeysLowSync = Date.now();
        void syncNow();
      },
    };
    const detach = () => {
      if (!attached) return;
      for (const [event, handler] of Object.entries(handlers)) attached.off?.(event, handler);
      attached = null;
    };
    const unsubscribe = socketSource((socket) => {
      detach();
      if (!socket) return;
      attached = socket;
      for (const [event, handler] of Object.entries(handlers)) socket.on(event, handler);
    });
    stopSocket = () => {
      unsubscribe?.();
      detach();
      stopSocket = null;
    };
  }

  async function fetchDevices(library, machine, userIds, { force = false } = {}) {
    const ids = userIds.filter((id) => force || !queried.has(id));
    if (ids.length === 0) return;
    const users = () => ids.map((id) => new library.UserId(matrixUserId(id)));
    await machine.updateTrackedUsers(users());
    if (force) {
      const request = machine.queryKeysForUsers(users());
      const response = await api.queryKeys(JSON.parse(request.body));
      await machine.markRequestAsSent(request.id, request.type, JSON.stringify(response));
    }
    await sendQueries(library, machine);
    for (const id of ids) queried.add(id);
  }

  /** Checks a decryption against the message it claims to be (see the module comment). */
  async function verified(library, machine, message, decrypted) {
    if (decrypted.shieldState(false).code === library.ShieldStateCode.MismatchedSender) {
      return 'mismatched_sender';
    }
    const deviceId = decrypted.senderDevice?.toString();
    const device = deviceId
      ? await machine.getDevice(
          new library.UserId(matrixUserId(message.senderId)),
          new library.DeviceId(deviceId),
        )
      : undefined;
    if (!device || device.curve25519Key?.toBase64() !== decrypted.senderCurve25519Key) {
      return 'unknown_sender_device';
    }
    return null;
  }

  async function decryptNow(message) {
    const library = await loadLibraryFn();
    const machine = openMachine();
    const event = JSON.stringify({
      event_id: `$${message.id}`,
      sender: matrixUserId(message.senderId),
      origin_server_ts: Date.parse(message.createdAt),
      room_id: roomIdFor(message.conversationId),
      type: 'm.room.encrypted',
      content: message.encrypted,
    });
    return withDevice(machine, async () => {
      let decrypted;
      try {
        decrypted = await machine.decryptRoomEvent(
          event,
          new library.RoomId(roomIdFor(message.conversationId)),
          new library.DecryptionSettings(library.TrustRequirement.Untrusted),
        );
      } catch (error) {
        const { DecryptionErrorCode } = library;
        if (
          error instanceof library.MegolmDecryptionError &&
          [DecryptionErrorCode.MissingRoomKey, DecryptionErrorCode.UnknownMessageIndex].includes(
            error.code,
          )
        ) {
          return { status: 'waiting' };
        }
        return { status: 'failed', reason: 'undecryptable' };
      }
      // The sender's devices, fetched once (again if this device is new to us).
      await fetchDevices(library, machine, [message.senderId]);
      let problem = await verified(library, machine, message, decrypted);
      if (problem === 'unknown_sender_device') {
        await fetchDevices(library, machine, [message.senderId], { force: true });
        problem = await verified(library, machine, message, decrypted);
      }
      if (problem) return { status: 'failed', reason: problem };
      const content = JSON.parse(decrypted.event).content ?? {};
      const meta = content['connect.message'];
      if (meta?.clientMessageId !== message.clientMessageId) {
        return { status: 'failed', reason: 'mismatched_message' };
      }
      const seenKey = `${message.senderId}|${message.clientMessageId}`;
      const first = firstSeenAs.get(seenKey);
      if (first && first !== message.id) return { status: 'failed', reason: 'replayed' };
      firstSeenAs.set(seenKey, message.id);
      // Verified only if this device completed verification with the sending device (F).
      const sender = await machine.getDevice(
        new library.UserId(matrixUserId(message.senderId)),
        new library.DeviceId(decrypted.senderDevice.toString()),
      );
      return { status: 'ok', content, verified: Boolean(sender?.isVerified()) };
    });
  }

  /** Runs a task on the verification flow `flowId` with `userId` (inside the device lock). */
  async function onFlow(userId, flowId, task) {
    const machine = openMachine();
    const library = await loadLibraryFn();
    return withDevice(machine, async () => {
      const request = machine.getVerificationRequest(
        new library.UserId(matrixUserId(userId)),
        flowId,
      );
      if (!request) throw new E2eeError('E2EE_VERIFICATION_GONE', 'This verification ended.');
      return task(library, machine, request);
    });
  }

  /** Sends whatever a verification step produced (one request, a list, or nothing). */
  async function sendOutgoing(machine, outgoing) {
    for (const request of [outgoing].flat())
      if (request) await sendToDeviceRequest(machine, request);
  }

  return {
    getState: () => state,
    getVersion: () => version,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /**
     * Opens this browser's device for `userId` if encryption was set up here before (or now, with
     * `setUp`), binds this sign-in to it and fetches what waits for it. Never throws; see the
     * state for the outcome.
     */
    async start(userId, { setUp = false } = {}) {
      if (state.userId && state.userId !== userId) this.stop();
      if (state.status === 'ready' || state.status === 'starting') return state;
      const reason = unsupportedReason();
      if (reason) {
        setState({ ...IDLE, status: 'unavailable', userId, error: reason });
        return state;
      }
      const ownGeneration = generation;
      try {
        if (!setUp && !(await deviceStore.get(userId))) {
          setState({ ...IDLE, userId });
          return state;
        }
        setState({ ...IDLE, status: 'starting', userId });
        const machine = await runtime.ensureReady(userId);
        if (ownGeneration !== generation) return state;
        if (!machine) {
          setState({ status: 'failed', error: runtime.getState().error ?? 'E2EE_FAILED' });
          return state;
        }
        const { deviceId } = runtime.getState();
        await bindOrRegister(machine, userId, deviceId);
        if (ownGeneration !== generation) return state;
        setState({ status: 'starting', deviceId });
        attachSocket();
        await runSync(ownGeneration);
        if (ownGeneration !== generation) return state;
        setState({ status: 'ready', error: null });
      } catch (error) {
        if (ownGeneration === generation) setState({ status: 'failed', error: codeOf(error) });
      }
      return state;
    },

    /** Sign-out, account switch: forgets session state (the device stays stored). */
    stop() {
      generation += 1;
      stopSocket?.();
      processedSeq = 0;
      syncing = null;
      syncAgain = false;
      results.clear();
      inFlight.clear();
      waiting.clear();
      firstSeenAs.clear();
      queried.clear();
      flowDevices.clear();
      if (state !== IDLE) {
        state = IDLE;
        emit();
      }
    },

    syncNow,

    /**
     * Encrypts `content` for a direct conversation: shares the conversation key with every device
     * of both people first. Throws E2eeError (or the API's error) and never falls back to plain
     * text. On a failed key share the conversation key is dropped, so the next attempt shares a
     * new one with everybody instead of using a key some devices never got.
     */
    async encrypt(conversation, content) {
      const machine = openMachine();
      const library = await loadLibraryFn();
      const selfId = state.userId;
      const peerId = conversation.peer?.id;
      if (conversation.type !== 'direct' || !peerId) {
        throw new E2eeError('E2EE_UNSUPPORTED', 'Only one-to-one chats are end-to-end encrypted.');
      }
      const ids = [selfId, peerId];
      const users = () => ids.map((id) => new library.UserId(matrixUserId(id)));
      const room = () => new library.RoomId(roomIdFor(conversation.id));
      return withDevice(machine, async () => {
        await machine.updateTrackedUsers(users());
        await sendQueries(library, machine);
        const peerDevices = (await machine.getUserDevices(new library.UserId(matrixUserId(peerId))))
          .devices()
          .filter((device) => !device.isDeleted());
        if (peerDevices.length === 0) {
          throw new E2eeError(
            'E2EE_PEER_NO_DEVICE',
            'The other person has no encryption device right now, so they couldn’t read it.',
          );
        }
        const claim = await machine.getMissingSessions(users());
        if (claim) {
          const response = await api.claimKeys(JSON.parse(claim.body));
          await machine.markRequestAsSent(claim.id, claim.type, JSON.stringify(response));
        }
        try {
          const shares = await machine.shareRoomKey(
            room(),
            users(),
            new library.EncryptionSettings(),
          );
          for (const share of shares) await sendToDeviceRequest(machine, share);
        } catch (error) {
          await machine.invalidateGroupSession(room()).catch(() => undefined);
          throw error;
        }
        return JSON.parse(
          await machine.encryptRoomEvent(room(), 'm.room.message', JSON.stringify(content)),
        );
      });
    },

    // ── Device verification (checkpoint F): SAS emoji, as the library implements it ─────────

    /** `userId`'s devices (fetched fresh) and whether this device verified each. */
    async devices(userId) {
      const machine = openMachine();
      const library = await loadLibraryFn();
      return withDevice(machine, async () => {
        await fetchDevices(library, machine, [userId], { force: true });
        const list = await machine.getUserDevices(new library.UserId(matrixUserId(userId)));
        return list
          .devices()
          .filter((device) => !device.isDeleted())
          .map((device) => ({
            deviceId: device.deviceId.toString(),
            verified: device.isVerified(),
            own: device.deviceId.toString() === state.deviceId && userId === state.userId,
          }))
          .filter((device) => !device.own);
      });
    },

    /** Asks `userId`'s device to verify with emoji; returns the flow id. */
    async requestVerification(userId, deviceId) {
      const machine = openMachine();
      const library = await loadLibraryFn();
      return withDevice(machine, async () => {
        const device = await machine.getDevice(
          new library.UserId(matrixUserId(userId)),
          new library.DeviceId(deviceId),
        );
        if (!device) throw new E2eeError('E2EE_UNKNOWN_DEVICE', 'That device is not known.');
        const [request, outgoing] = device.requestVerification([library.VerificationMethod.SasV1]);
        await sendOutgoing(machine, outgoing);
        return request.flowId;
      });
    },

    /** Verification requests from `userId` waiting for an answer here. */
    async incomingVerifications(userId) {
      const machine = openMachine();
      const library = await loadLibraryFn();
      return machine
        .getVerificationRequests(new library.UserId(matrixUserId(userId)))
        .filter((request) => !request.weStarted() && !request.isDone() && !request.isCancelled())
        .map((request) => ({
          flowId: request.flowId,
          deviceId: request.otherDeviceId?.toString() ?? null,
        }));
    },

    /**
     * Moves a flow on as far as the protocol allows without the person (accepting, starting the
     * emoji step) and describes it. `verified` is only ever the library's own verdict.
     */
    async verificationStep(userId, flowId, { accept = false } = {}) {
      const machine = openMachine();
      const library = await loadLibraryFn();
      const user = () => new library.UserId(matrixUserId(userId));
      return withDevice(machine, async () => {
        const request = machine.getVerificationRequest(user(), flowId);
        if (!request) {
          // Finished and dropped by the library: its verdict on that device is the outcome.
          const deviceId = flowDevices.get(flowId);
          const device = deviceId
            ? await machine.getDevice(user(), new library.DeviceId(deviceId))
            : undefined;
          return { status: device?.isVerified() ? 'done' : 'cancelled', emoji: [] };
        }
        const other = request.otherDeviceId?.toString();
        if (other) flowDevices.set(flowId, other);
        if (accept && !request.weStarted() && !request.isReady() && !request.isCancelled()) {
          await sendOutgoing(
            machine,
            request.acceptWithMethods([library.VerificationMethod.SasV1]),
          );
        }
        let sas = request.getVerification();
        if (!sas && request.isReady() && request.weStarted()) {
          const started = await request.startSas();
          if (started) {
            [sas] = started;
            await sendOutgoing(machine, started[1]);
          }
        }
        if (sas && !sas.weStarted() && !sas.hasBeenAccepted() && !sas.isCancelled()) {
          await sendOutgoing(machine, sas.accept());
        }
        const status =
          request.isCancelled() || sas?.isCancelled()
            ? 'cancelled'
            : sas?.isDone() || request.isDone()
              ? 'done'
              : sas?.haveWeConfirmed()
                ? 'waiting_for_them'
                : sas?.canBePresented()
                  ? 'compare'
                  : 'waiting';
        return {
          status,
          emoji:
            status === 'compare'
              ? (sas.emoji() ?? []).map((item) => ({
                  symbol: item.symbol,
                  description: item.description,
                }))
              : [],
        };
      });
    },

    /** The person saw the same emoji on both screens. */
    async confirmVerification(userId, flowId) {
      return onFlow(userId, flowId, async (_library, machine, request) => {
        const sas = request.getVerification();
        if (!sas?.canBePresented())
          throw new E2eeError('E2EE_VERIFICATION_GONE', 'Nothing to confirm.');
        await sendOutgoing(machine, await sas.confirm());
      });
    },

    /** The emoji differ, or the person gave up: the flow is cancelled for both. */
    async cancelVerification(userId, flowId) {
      return onFlow(userId, flowId, async (_library, machine, request) => {
        await sendOutgoing(machine, request.cancel());
      });
    },

    /** The decryption result for a message, if known: { status, content?, reason? }. */
    resultFor(message) {
      return results.get(`${message.id}:${message.rev}`);
    },

    /** Starts decrypting `message` if it isn't known yet (results arrive through subscribe). */
    request(message) {
      const key = `${message.id}:${message.rev}`;
      if (results.has(key) || inFlight.has(key)) return;
      if (state.status !== 'ready') return;
      const ownGeneration = generation;
      const run = decryptNow(message)
        .catch(() => ({ status: 'failed', reason: 'undecryptable' }))
        .then((result) => {
          inFlight.delete(key);
          if (ownGeneration !== generation) return;
          results.set(key, result);
          if (result.status === 'waiting') waiting.set(key, message);
          emit();
        });
      inFlight.set(key, run);
    },

    /** Your own message, just sent from here: no need to decrypt what you wrote. */
    remember(message, content) {
      results.set(`${message.id}:${message.rev}`, { status: 'ok', content, verified: false });
      firstSeenAs.set(`${message.senderId}|${message.clientMessageId}`, message.id);
      emit();
    },
  };
}

/** The app's single client. */
export const e2eeClient = createE2eeClient();
