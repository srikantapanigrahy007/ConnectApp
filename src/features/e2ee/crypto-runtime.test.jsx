/**
 * Unit tests (jsdom) with injected fakes for the library, the device store and the lock. They
 * check the state machine only; real WebAssembly, IndexedDB and Web Locks behaviour is covered by
 * crypto-runtime.browser.test.js in real Chrome.
 */
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createCryptoRuntime, e2eeUnsupportedReason } from './crypto-runtime';
import { E2EELifecycle } from './E2EELifecycle';

let sessionUser = { id: 'alice' };
vi.mock('../auth/hooks', () => ({ useSession: () => ({ user: sessionUser }) }));

function fakes({ initAsync = vi.fn(async () => undefined), lockAvailable = true } = {}) {
  const machines = [];
  const library = {
    initAsync,
    UserId: class {
      constructor(id) {
        this.id = id;
      }
    },
    DeviceId: class {
      constructor(id) {
        this.id = id;
      }
    },
    StoreHandle: {
      openWithKey: vi.fn(async (name, key) => ({ name, keyLength: key.length, free: vi.fn() })),
    },
    OlmMachine: {
      initFromStore: vi.fn(async (userId, deviceId) => {
        const machine = { userId: userId.id, deviceId: deviceId.id, close: vi.fn() };
        machines.push(machine);
        return machine;
      }),
    },
  };
  const records = new Map();
  const deviceStore = {
    get: vi.fn(async (userId) => records.get(userId) ?? null),
    create: vi.fn(async (userId) => {
      const record = { userId, deviceId: `DEV-${userId}`, storeName: `store-${userId}` };
      records.set(userId, record);
      return record;
    }),
    unwrapStoreKey: vi.fn(async () => new Uint8Array(32).fill(7)),
    delete: vi.fn(async (userId) => records.delete(userId)),
  };
  const releases = [];
  const acquireLock = vi.fn(async () => {
    if (!lockAvailable) return null;
    const release = vi.fn(async () => undefined);
    releases.push(release);
    return { release };
  });
  const loadLibrary = vi.fn(async () => library);
  const runtime = createCryptoRuntime({
    loadLibrary,
    deviceStore,
    acquireLock,
    unsupportedReason: () => null,
  });
  return { runtime, library, deviceStore, acquireLock, loadLibrary, machines, releases };
}

describe('crypto runtime state machine', () => {
  it('loads nothing until asked, then becomes ready once for repeated and concurrent calls', async () => {
    const { runtime, loadLibrary, library, deviceStore } = fakes();
    expect(runtime.getState().status).toBe('idle');
    expect(loadLibrary).not.toHaveBeenCalled();

    const results = await Promise.all([
      runtime.ensureReady('alice'),
      runtime.ensureReady('alice'),
      runtime.ensureReady('alice'),
    ]);
    expect(new Set(results).size).toBe(1);
    expect(await runtime.ensureReady('alice')).toBe(results[0]);
    expect(library.initAsync).toHaveBeenCalledTimes(1);
    expect(deviceStore.create).toHaveBeenCalledTimes(1);
    expect(runtime.getState()).toEqual({
      status: 'ready',
      userId: 'alice',
      deviceId: 'DEV-alice',
      error: null,
    });
    // The raw store key was handed to the library as 32 bytes and zeroed afterwards.
    expect(library.StoreHandle.openWithKey.mock.calls[0][1]).toEqual(new Uint8Array(32));
  });

  it('reports a load failure, releases the lock, and succeeds on retry', async () => {
    const initAsync = vi
      .fn()
      .mockRejectedValueOnce(new Error('network error fetching .wasm'))
      .mockResolvedValue(undefined);
    const { runtime, releases } = fakes({ initAsync });
    expect(await runtime.ensureReady('alice')).toBeNull();
    expect(runtime.getState()).toMatchObject({ status: 'failed', error: 'load_failed' });
    expect(releases[0]).toHaveBeenCalled();

    expect(await runtime.ensureReady('alice')).not.toBeNull();
    expect(runtime.getState().status).toBe('ready');
  });

  it('an unreadable store is reported without deleting anything', async () => {
    const { runtime, library, deviceStore } = fakes();
    library.StoreHandle.openWithKey.mockRejectedValueOnce(new Error('decryption failed'));
    expect(await runtime.ensureReady('alice')).toBeNull();
    expect(runtime.getState()).toMatchObject({ status: 'failed', error: 'store_unreadable' });
    expect(deviceStore.delete).not.toHaveBeenCalled();
    expect(JSON.stringify(runtime.getState())).not.toContain('decryption failed');
  });

  it('is unavailable when another tab holds the device', async () => {
    const { runtime, loadLibrary } = fakes({ lockAvailable: false });
    expect(await runtime.ensureReady('alice')).toBeNull();
    expect(runtime.getState()).toMatchObject({
      status: 'unavailable',
      error: 'open_in_another_tab',
    });
    expect(loadLibrary).not.toHaveBeenCalled();
  });

  it('switching accounts closes the previous device and never reuses it', async () => {
    const { runtime, machines, releases } = fakes();
    const alice = await runtime.ensureReady('alice');
    const bob = await runtime.ensureReady('bob');
    expect(alice.close).toHaveBeenCalled();
    expect(releases[0]).toHaveBeenCalled();
    expect(bob).toMatchObject({ userId: '@bob:connect', deviceId: 'DEV-bob' });
    expect(machines).toHaveLength(2);
  });

  it('signing out during initialization discards the half-opened device', async () => {
    let finishInit;
    const initAsync = vi.fn(() => new Promise((resolve) => (finishInit = resolve)));
    const { runtime, machines } = fakes({ initAsync });
    const opening = runtime.ensureReady('alice');
    await vi.waitFor(() => expect(initAsync).toHaveBeenCalled());
    await runtime.close();
    finishInit();
    expect(await opening).toBeNull();
    expect(runtime.getState().status).toBe('idle');
    expect(machines.every((machine) => machine.close.mock.calls.length > 0)).toBe(true);
  });

  it('never reopens a device whose deletion did not finish', async () => {
    const { runtime, deviceStore, library, releases } = fakes();
    deviceStore.get.mockResolvedValueOnce({
      userId: 'alice',
      deviceId: 'DEV-alice',
      storeName: 'store-alice',
      pendingDeletion: '2026-10-14T00:00:00.000Z',
    });
    expect(await runtime.ensureReady('alice')).toBeNull();
    expect(runtime.getState()).toMatchObject({ status: 'failed', error: 'deletion_pending' });
    expect(library.StoreHandle.openWithKey).not.toHaveBeenCalled();
    expect(releases[0]).toHaveBeenCalled();
  });

  it('refuses to run without a signed-in user', async () => {
    const { runtime } = fakes();
    await expect(runtime.ensureReady(null)).rejects.toThrow(/signed-in user/);
  });
});

describe('unsupported environments', () => {
  it('names what is missing, and the runtime stays usable as "unavailable"', async () => {
    expect(e2eeUnsupportedReason({})).toBe('not_a_browser');
    expect(e2eeUnsupportedReason({ window: {} })).toBe('no_webassembly');
    const browserish = { window: {}, WebAssembly: { instantiate() {} } };
    expect(e2eeUnsupportedReason(browserish)).toBe('no_indexeddb');
    // jsdom has no IndexedDB: the real default runtime reports it instead of crashing.
    const real = createCryptoRuntime();
    expect(await real.ensureReady('alice')).toBeNull();
    expect(real.getState()).toMatchObject({ status: 'unavailable', error: 'no_indexeddb' });
  });
});

describe('E2EELifecycle', () => {
  it('starts encryption for the account (if set up here) and stops it when the account changes or signs out', () => {
    const runtime = { close: vi.fn(async () => undefined) };
    const client = { start: vi.fn(async () => undefined), stop: vi.fn() };
    sessionUser = { id: 'alice' };
    const view = render(<E2EELifecycle runtime={runtime} client={client} />);
    expect(client.start).toHaveBeenCalledWith('alice');
    expect(runtime.close).not.toHaveBeenCalled();
    sessionUser = { id: 'bob' };
    view.rerender(<E2EELifecycle runtime={runtime} client={client} />);
    expect(client.stop).toHaveBeenCalledTimes(1);
    expect(runtime.close).toHaveBeenCalledTimes(1);
    expect(client.start).toHaveBeenLastCalledWith('bob');
    view.unmount();
    expect(client.stop).toHaveBeenCalledTimes(2);
    expect(runtime.close).toHaveBeenCalledTimes(2);
  });
});
