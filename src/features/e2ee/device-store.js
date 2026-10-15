/**
 * Where this browser keeps its end-to-end encryption device, per Connect account.
 *
 * The cryptographic state itself (identity keys, sessions) lives in the Matrix crypto library's
 * own IndexedDB store, encrypted by the library with a 32-byte store key
 * (`StoreHandle.openWithKey`). This module only keeps, in a small IndexedDB database
 * `connect-e2ee` (never localStorage/sessionStorage, never sent to the server):
 *
 *   { userId, deviceId, storeName, wrappingKey, iv, wrappedStoreKey, createdAt }
 *
 * The store key is encrypted (AES-GCM) with `wrappingKey`, a NON-EXTRACTABLE WebCrypto key,
 * the same approach Element Web uses for its pickle key. The raw store key exists only in memory
 * while the store is being opened. Limits: any script running in Connect's origin (XSS, a
 * malicious deployment, an extension with page access) can still *use* the wrapping key and open
 * the store; someone with a copy of the browser profile may recover it as well. It prevents
 * casual reading of the raw key from storage dumps, nothing more.
 */

const DB_NAME = 'connect-e2ee';
const DB_VERSION = 1;
const DEVICES = 'devices';
/**
 * The library documents only that the store "name" is used to open its IndexedDB database(s).
 * Observed in Chrome with 18.9.0: `<storeName>::matrix-sdk-crypto` and
 * `<storeName>::matrix-sdk-crypto-meta`. Those exact names are internal and not relied on:
 * deletion lists the databases that actually exist under this device's unique prefix.
 */
const libraryDatabasePrefix = (storeName) => `${storeName}::`;
/** How long a database deletion may wait for open connections to close. */
const DELETE_TIMEOUT_MS = 5_000;

const DEVICE_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function request(idbRequest) {
  return new Promise((resolve, reject) => {
    idbRequest.onsuccess = () => resolve(idbRequest.result);
    idbRequest.onerror = () => reject(idbRequest.error ?? new Error('IndexedDB request failed'));
  });
}

let databasePromise = null;

function openDatabase() {
  if (!databasePromise) {
    const opening = indexedDB.open(DB_NAME, DB_VERSION);
    opening.onupgradeneeded = () => {
      if (!opening.result.objectStoreNames.contains(DEVICES)) {
        opening.result.createObjectStore(DEVICES, { keyPath: 'userId' });
      }
    };
    databasePromise = request(opening).then((db) => {
      // Another tab upgrading or deleting the database: let it, and reopen next time.
      db.onversionchange = () => {
        db.close();
        databasePromise = null;
      };
      return db;
    });
    databasePromise.catch(() => {
      databasePromise = null;
    });
  }
  return databasePromise;
}

async function withStore(mode, run) {
  const db = await openDatabase();
  const transaction = db.transaction(DEVICES, mode);
  const done = new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('Transaction aborted'));
  });
  const result = await run(transaction.objectStore(DEVICES));
  await done;
  return result;
}

/** A Matrix-style device id: 10 random capital letters (like the ids homeservers assign). */
function newDeviceId() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return [...bytes].map((byte) => DEVICE_ID_ALPHABET[byte % DEVICE_ID_ALPHABET.length]).join('');
}

export async function getDeviceRecord(userId) {
  return (await withStore('readonly', (store) => request(store.get(userId)))) ?? null;
}

/**
 * Creates this browser's device for `userId`: a new device id, a new random 32-byte store key
 * (wrapped as described above) and a new store name. Overwrites nothing: call only when
 * getDeviceRecord returned null, under the device lock.
 */
export async function createDeviceRecord(userId) {
  const deviceId = newDeviceId();
  const storeKey = crypto.getRandomValues(new Uint8Array(32));
  const wrappingKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrappedStoreKey = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    wrappingKey,
    storeKey,
  );
  storeKey.fill(0);
  const record = {
    userId,
    deviceId,
    storeName: `connect-e2ee-store-${deviceId}`,
    wrappingKey,
    iv,
    wrappedStoreKey,
    createdAt: new Date().toISOString(),
  };
  await withStore('readwrite', (store) => request(store.add(record)));
  return record;
}

/** The raw store key, for StoreHandle.openWithKey only. Callers must zero it afterwards. */
export async function unwrapStoreKey(record) {
  const raw = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: record.iv },
    record.wrappingKey,
    record.wrappedStoreKey,
  );
  const key = new Uint8Array(raw);
  if (key.length !== 32) throw new Error('Store key has the wrong length');
  return key;
}

/**
 * Deletes one database and waits until the browser confirms it. A deletion that is still blocked
 * by an open connection after the timeout is reported as "blocked" (the browser keeps the request
 * queued and may finish it later), never as deleted.
 */
function deleteDatabase(name, timeoutMs = DELETE_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve('blocked'), timeoutMs);
    const deleting = indexedDB.deleteDatabase(name);
    deleting.onsuccess = () => {
      clearTimeout(timer);
      resolve('deleted');
    };
    deleting.onerror = () => {
      clearTimeout(timer);
      resolve('failed');
    };
  });
}

/**
 * Forgets this browser's device for `userId` (explicit user action only; the caller holds the
 * device lock, so no tab of this browser has it open). Order matters:
 *
 * 1. find the library databases that exist under this device's unique store name;
 * 2. delete each and wait for confirmation;
 * 3. only if all are gone, delete the record holding the wrapped store key.
 *
 * If a database can't be deleted, the record is kept and marked `pendingDeletion`: the browser
 * may still finish the queued deletion later, so the device must not be opened again (the
 * library would silently start an empty store with new keys under the same device id). The
 * runtime refuses to open it until forgetting succeeds; the result says what remains. Keys deleted here are gone for good: messages only
 * this device could decrypt stay undecryptable.
 *
 * @returns {Promise<{ forgotten: boolean, reason?: string, deleted: string[], remaining: string[] }>}
 */
export async function deleteDevice(userId) {
  const record = await getDeviceRecord(userId);
  if (!record) return { forgotten: false, reason: 'no_device', deleted: [], remaining: [] };
  if (typeof indexedDB.databases !== 'function') {
    // Without a way to list databases, completeness can't be confirmed: delete nothing.
    return { forgotten: false, reason: 'cannot_list_databases', deleted: [], remaining: [] };
  }
  const prefix = libraryDatabasePrefix(record.storeName);
  const names = (await indexedDB.databases())
    .map((database) => database.name)
    .filter((name) => typeof name === 'string' && name.startsWith(prefix));
  const outcomes = await Promise.all(names.map((name) => deleteDatabase(name)));
  const deleted = names.filter((_name, index) => outcomes[index] === 'deleted');
  const remaining = names.filter((_name, index) => outcomes[index] !== 'deleted');
  if (remaining.length > 0) {
    await withStore('readwrite', (store) =>
      request(store.put({ ...record, pendingDeletion: new Date().toISOString() })),
    );
    return { forgotten: false, reason: 'database_in_use', deleted, remaining };
  }
  await withStore('readwrite', (store) => request(store.delete(userId)));
  return { forgotten: true, deleted, remaining: [] };
}

export const deviceStore = {
  get: getDeviceRecord,
  create: createDeviceRecord,
  unwrapStoreKey,
  delete: deleteDevice,
};
