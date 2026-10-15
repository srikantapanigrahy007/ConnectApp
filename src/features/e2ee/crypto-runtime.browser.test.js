/**
 * Runs in real Google Chrome (vitest.browser.config.js): the real Matrix crypto WebAssembly, the
 * library's real IndexedDB store, real Web Crypto and real Web Locks. No mocks.
 *
 * "Reload" here means a new runtime instance in the same page reading the same IndexedDB (the
 * WebAssembly module itself stays loaded); "another tab" means a second runtime instance
 * contending for the same Web Lock. A literal page reload and two literal tabs are not driven by
 * this runner.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCryptoRuntime } from './crypto-runtime';
import { getDeviceRecord } from './device-store';

const ALICE = '64b0000000000000000000a1';
const BOB = '64b0000000000000000000b2';
const runtimes = [];
const runtime = () => {
  const created = createCryptoRuntime();
  runtimes.push(created);
  return created;
};
const identityKey = (machine) => machine.identityKeys.ed25519.toBase64();

async function deleteAllE2eeDatabases() {
  for (const { name } of await indexedDB.databases()) {
    if (name?.startsWith('connect-e2ee')) {
      await new Promise((resolve) => {
        const deleting = indexedDB.deleteDatabase(name);
        deleting.onsuccess = deleting.onerror = deleting.onblocked = resolve;
      });
    }
  }
}

beforeEach(async () => {
  await deleteAllE2eeDatabases();
});
afterEach(async () => {
  for (const created of runtimes.splice(0)) await created.close();
});

describe('real browser: WebAssembly and IndexedDB', () => {
  it('loads the library, creates a device and keeps it in the library IndexedDB store', async () => {
    const first = runtime();
    expect(first.getState().status).toBe('idle');
    const machine = await first.ensureReady(ALICE);

    expect(first.getState()).toMatchObject({ status: 'ready', userId: ALICE, error: null });
    expect(machine.userId.toString()).toBe(`@${ALICE}:connect`);
    expect(identityKey(machine)).toMatch(/^[A-Za-z0-9+/]{43}$/);

    const record = await getDeviceRecord(ALICE);
    expect(record.deviceId).toBe(first.getState().deviceId);
    const names = (await indexedDB.databases()).map((db) => db.name);
    // Observed library database names (internal to the library, checked here, not relied on).
    expect(names).toContain(`${record.storeName}::matrix-sdk-crypto`);
    expect(names).toContain(`${record.storeName}::matrix-sdk-crypto-meta`);
  });

  it('repeated and concurrent calls share one device', async () => {
    const first = runtime();
    const [a, b, c] = await Promise.all([
      first.ensureReady(ALICE),
      first.ensureReady(ALICE),
      first.ensureReady(ALICE),
    ]);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(await first.ensureReady(ALICE)).toBe(a);
  });

  it('keeps accounts apart: switching closes the old device and opens a separate one', async () => {
    const shared = runtime();
    const alice = await shared.ensureReady(ALICE);
    const aliceKey = identityKey(alice);
    const aliceDevice = shared.getState().deviceId;

    const bob = await shared.ensureReady(BOB);
    expect(shared.getState()).toMatchObject({ status: 'ready', userId: BOB });
    expect(shared.getState().deviceId).not.toBe(aliceDevice);
    expect(identityKey(bob)).not.toBe(aliceKey);
    expect(bob.userId.toString()).toBe(`@${BOB}:connect`);
    // Alice's device was closed, not reused, and is intact for her next sign-in.
    expect(() => alice.identityKeys).toThrow();
    await shared.close();
    const back = runtime();
    expect(identityKey(await back.ensureReady(ALICE))).toBe(aliceKey);
  });

  it('an unreadable store fails safely, is not wiped, and can be replaced on request', async () => {
    const first = runtime();
    await first.ensureReady(ALICE);
    const { deviceId } = first.getState();
    await first.close();

    // Corrupt the wrapped store key in place.
    const db = await new Promise((resolve) => {
      const opening = indexedDB.open('connect-e2ee');
      opening.onsuccess = () => resolve(opening.result);
    });
    await new Promise((resolve) => {
      const store = db.transaction('devices', 'readwrite').objectStore('devices');
      const get = store.get(ALICE);
      get.onsuccess = () => {
        const record = get.result;
        const bytes = new Uint8Array(record.wrappedStoreKey);
        bytes[0] ^= 0xff;
        store.put({ ...record, wrappedStoreKey: bytes.buffer }).onsuccess = resolve;
      };
    });
    db.close();

    const broken = runtime();
    expect(await broken.ensureReady(ALICE)).toBeNull();
    expect(broken.getState()).toMatchObject({ status: 'failed', error: 'store_unreadable' });
    expect((await getDeviceRecord(ALICE)).deviceId).toBe(deviceId); // nothing deleted

    // Explicit "forget this device", then a new device can be created.
    expect(await broken.forgetDevice(ALICE)).toMatchObject({ forgotten: true, remaining: [] });
    expect(await broken.ensureReady(ALICE)).not.toBeNull();
    expect(broken.getState().deviceId).not.toBe(deviceId);
  });
});

describe('real browser: where key material lives', () => {
  it('nothing is written to localStorage or sessionStorage; the wrapping key cannot be exported', async () => {
    localStorage.clear();
    sessionStorage.clear();
    await runtime().ensureReady(ALICE);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);

    const record = await getDeviceRecord(ALICE);
    expect(record.wrappingKey.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', record.wrappingKey)).rejects.toThrow();
    // The stored store key is ciphertext (32 bytes + 16-byte AES-GCM tag), never the raw key.
    expect(record.wrappedStoreKey.byteLength).toBe(48);
  });

  it('the UI-facing state never contains key material', async () => {
    const first = runtime();
    const machine = await first.ensureReady(ALICE);
    const state = JSON.stringify(first.getState());
    expect(Object.keys(first.getState()).sort()).toEqual(['deviceId', 'error', 'status', 'userId']);
    expect(state).not.toContain(identityKey(machine));
  });
});
