import { deviceStore as defaultDeviceStore } from './device-store';

/**
 * This browser's end-to-end encryption device for the signed-in account (Phase 15, Stage B,
 * checkpoint A). Nothing calls `ensureReady` yet: E2EE is not enabled for anyone, and ordinary
 * chats never depend on this module.
 *
 * States: idle → initializing → ready | failed | unavailable.
 * - idle: nothing loaded (initial, after sign-out, after an account switch).
 * - initializing: the library is loading or the device store is opening.
 * - ready: an OlmMachine bound to this account's device is open (`getMachine()`).
 * - failed: loading or opening failed; `ensureReady` may be called again (retry). Stored state is
 *   never deleted automatically (an unreadable store is reported, not wiped). `deletion_pending`:
 *   an earlier forgetDevice couldn't finish; only forgetting again can clear it.
 * - unavailable: this browser can't run it (no WebAssembly / IndexedDB / Web Crypto / Web Locks),
 *   or another tab already has this account's device open.
 *
 * Only one runtime per browser may open an account's device at a time: an exclusive Web Lock
 * (`connect-e2ee-device:<userId>`) is held while the device is open, so two tabs can never write
 * the same store concurrently. The library is imported lazily, on the first `ensureReady`.
 * State exposed to the UI never contains key material.
 */

/** Connect user ids become Matrix-style ids for the library (never sent anywhere yet). */
export const matrixUserId = (userId) => `@${userId}:connect`;

/** Why this environment can't run E2EE, or null. */
export function e2eeUnsupportedReason(environment = globalThis) {
  if (typeof environment.window === 'undefined') return 'not_a_browser';
  if (typeof environment.WebAssembly?.instantiate !== 'function') return 'no_webassembly';
  if (typeof environment.indexedDB?.open !== 'function') return 'no_indexeddb';
  if (typeof environment.crypto?.subtle?.encrypt !== 'function') return 'no_webcrypto';
  if (typeof environment.navigator?.locks?.request !== 'function') return 'no_web_locks';
  return null;
}

/**
 * Holds an exclusive lock until `release()`, which resolves once the browser has actually let it
 * go (releasing is asynchronous). Resolves null when someone else holds it.
 */
function acquireBrowserLock(name) {
  return new Promise((resolve, reject) => {
    let releaseLock;
    const released = navigator.locks.request(name, { ifAvailable: true }, (lock) => {
      if (!lock) {
        resolve(null);
        return undefined;
      }
      resolve({
        release: () => {
          releaseLock();
          return released;
        },
      });
      return new Promise((done) => {
        releaseLock = done;
      });
    });
    released.catch(reject);
  });
}

const loadMatrixCrypto = () => import('@matrix-org/matrix-sdk-crypto-wasm');

const IDLE = Object.freeze({ status: 'idle', userId: null, deviceId: null, error: null });

/**
 * @param {{ loadLibrary?: () => Promise<object>, deviceStore?: typeof defaultDeviceStore, acquireLock?: (name: string) => Promise<{ release: () => void } | null>, unsupportedReason?: () => string | null }} [deps]
 *   Injected in unit tests; the defaults are the real library, IndexedDB and Web Locks.
 */
export function createCryptoRuntime({
  loadLibrary = loadMatrixCrypto,
  deviceStore = defaultDeviceStore,
  acquireLock = acquireBrowserLock,
  unsupportedReason = () => e2eeUnsupportedReason(),
} = {}) {
  let state = IDLE;
  let machine = null;
  let lock = null;
  let pending = null;
  /** Bumped on every close: work started for an older generation is discarded. */
  let generation = 0;
  const listeners = new Set();

  function setState(next) {
    state = Object.freeze({ ...IDLE, ...next });
    for (const listener of listeners) listener(state);
  }

  /** Closes the machine (and its IndexedDB connections) and releases the lock. */
  function releaseAll() {
    try {
      machine?.close();
    } catch {
      // Already closed.
    }
    machine = null;
    const releasing = lock?.release() ?? Promise.resolve();
    lock = null;
    return releasing;
  }

  async function open(userId, ownGeneration) {
    const reason = unsupportedReason();
    if (reason) {
      setState({ status: 'unavailable', userId, error: reason });
      return null;
    }
    setState({ status: 'initializing', userId });

    const acquired = await acquireLock(`connect-e2ee-device:${userId}`);
    if (ownGeneration !== generation) {
      acquired?.release();
      return null;
    }
    if (!acquired) {
      setState({ status: 'unavailable', userId, error: 'open_in_another_tab' });
      return null;
    }
    lock = acquired;

    let stage = 'load_failed';
    try {
      const library = await loadLibrary();
      await library.initAsync();

      stage = 'storage_failed';
      const record = (await deviceStore.get(userId)) ?? (await deviceStore.create(userId));
      if (record.pendingDeletion) {
        // A forget didn't finish: the store may be partly deleted. Finish forgetting first.
        await releaseAll();
        setState({ status: 'failed', userId, error: 'deletion_pending' });
        return null;
      }

      stage = 'store_unreadable';
      const storeKey = await deviceStore.unwrapStoreKey(record);
      let handle;
      let opened;
      try {
        handle = await library.StoreHandle.openWithKey(record.storeName, storeKey);
        opened = await library.OlmMachine.initFromStore(
          new library.UserId(matrixUserId(userId)),
          new library.DeviceId(record.deviceId),
          handle,
        );
      } finally {
        storeKey.fill(0);
        // The machine keeps its own reference to the store; this handle would otherwise hold
        // the IndexedDB connection open until garbage collection (blocking reopen and deletion).
        handle?.free();
      }

      if (ownGeneration !== generation) {
        // Signed out or switched accounts while this was opening.
        opened.close();
        return null;
      }
      machine = opened;
      setState({ status: 'ready', userId, deviceId: record.deviceId });
      return machine;
    } catch {
      // The error itself may describe stored data; only a fixed code is kept.
      if (ownGeneration === generation) {
        await releaseAll();
        setState({ status: 'failed', userId, error: stage });
      }
      return null;
    }
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /**
     * Opens this browser's device for `userId` (creating it on first use) and resolves with the
     * OlmMachine, or null when it isn't possible (see the state for why). Repeated and
     * concurrent calls share one initialization; after `failed`, calling again retries.
     */
    async ensureReady(userId) {
      if (!userId) throw new Error('A signed-in user is required');
      if (state.userId && state.userId !== userId) await this.close(); // never reuse another account
      if (state.status === 'ready') return machine;
      if (pending) return pending;
      const ownGeneration = generation;
      pending = open(userId, ownGeneration).finally(() => {
        if (ownGeneration === generation) pending = null;
      });
      return pending;
    },

    /** The open machine for the ready account (later checkpoints use it), or null. */
    getMachine: () => (state.status === 'ready' ? machine : null),

    /**
     * Closes the device (sign-out, account switch). Keys stay stored on this browser. Resolves
     * once the lock is released, so another runtime or tab can open the device right away.
     */
    async close() {
      generation += 1;
      pending = null;
      const releasing = releaseAll();
      if (state.status !== 'idle') setState(IDLE);
      await releasing;
    },

    /**
     * Deletes this browser's device for `userId` (explicit user action only). Closes it here
     * first (machine and lock), then deletes under the device lock, so no tab of this browser can
     * open it meanwhile. Refused, with nothing deleted, while another tab has it open.
     *
     * @returns {Promise<{ forgotten: boolean, reason?: string, deleted: string[], remaining: string[] }>}
     */
    async forgetDevice(userId) {
      if (state.userId === userId) await this.close();
      const held = await acquireLock(`connect-e2ee-device:${userId}`);
      if (!held) {
        return { forgotten: false, reason: 'open_in_another_tab', deleted: [], remaining: [] };
      }
      try {
        return await deviceStore.delete(userId);
      } finally {
        await held.release();
      }
    },
  };
}

/** The app's single runtime. */
export const cryptoRuntime = createCryptoRuntime();
