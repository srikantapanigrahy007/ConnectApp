/**
 * Unit tests (jsdom, fake library and mocked API) for the decisions e2ee-client.js makes around
 * the library. Real devices: backend/test/e2ee-messaging.test.js (real API) and
 * frontend/e2e/e2ee-messaging.e2e.test.js (two Chrome profiles against the real API).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from './api';
import { createE2eeClient } from './e2ee-client';

vi.mock('./api', () => ({
  bindingChallenge: vi.fn(),
  bindDevice: vi.fn(async () => undefined),
  syncToDevice: vi.fn(),
  sendToDevice: vi.fn(async () => ({})),
  claimKeys: vi.fn(async () => ({ one_time_keys: {}, failures: {} })),
  queryKeys: vi.fn(async () => ({ device_keys: {}, failures: {} })),
  uploadKeys: vi.fn(),
}));
vi.mock('./device-registration', () => ({
  registerCurrentDevice: vi.fn(async () => ({ registered: true })),
}));

const USER = '64b0000000000000000000a1';
const PEER = '64b0000000000000000000b2';
const DEVICE = 'ABCDEFGHIJ';
const SESSION = 'a'.repeat(24);
const challenge = (deviceId = DEVICE) =>
  `connect-e2ee-device-binding:v1:${SESSION}:${deviceId}:${Date.now()}:${'n'.repeat(22)}`;

class MegolmDecryptionError extends Error {
  constructor(code) {
    super('megolm');
    this.code = code;
  }
}
const library = {
  RequestType: { KeysUpload: 0, KeysQuery: 1, KeysClaim: 2, ToDevice: 3 },
  DeviceLists: class {},
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
  RoomId: class {
    constructor(id) {
      this.id = id;
    }
  },
  EncryptionSettings: class {},
  DecryptionSettings: class {},
  TrustRequirement: { Untrusted: 0 },
  ShieldStateCode: { UnknownDevice: 1, MismatchedSender: 5 },
  DecryptionErrorCode: { MissingRoomKey: 0, UnknownMessageIndex: 1 },
  MegolmDecryptionError,
};

const SENDER_CURVE = 'C'.repeat(43);

function setup({ decrypted, peerDevices = 1, senderVerified = false } = {}) {
  const machine = {
    sign: vi.fn(async () => ({
      asJSON: () =>
        JSON.stringify({ [`@${USER}:connect`]: { [`ed25519:${DEVICE}`]: 'S'.repeat(86) } }),
    })),
    outgoingRequests: vi.fn(async () => []),
    markRequestAsSent: vi.fn(async () => true),
    receiveSyncChanges: vi.fn(async () => []),
    updateTrackedUsers: vi.fn(async () => undefined),
    getMissingSessions: vi.fn(async () => null),
    getUserDevices: vi.fn(async () => ({
      devices: () => Array.from({ length: peerDevices }, () => ({ isDeleted: () => false })),
    })),
    shareRoomKey: vi.fn(async () => [
      { id: 't1', txn_id: 't1', type: 3, event_type: 'm.room.encrypted', body: '{"messages":{}}' },
    ]),
    encryptRoomEvent: vi.fn(async () => JSON.stringify({ algorithm: 'm.megolm.v1.aes-sha2' })),
    invalidateGroupSession: vi.fn(async () => true),
    decryptRoomEvent: vi.fn(async () => decrypted()),
    getDevice: vi.fn(async (user, device) =>
      device.id === 'SENDERDEVI' && user.id === `@${PEER}:connect`
        ? { curve25519Key: { toBase64: () => SENDER_CURVE }, isVerified: () => senderVerified }
        : undefined,
    ),
    queryKeysForUsers: vi.fn(() => ({ id: 'q', type: 1, body: '{"device_keys":{}}' })),
  };
  let runtimeState = { status: 'idle', userId: null, deviceId: null };
  const runtime = {
    getState: () => runtimeState,
    getMachine: () => (runtimeState.status === 'ready' ? machine : null),
    ensureReady: vi.fn(async (userId) => {
      runtimeState = { status: 'ready', userId, deviceId: DEVICE };
      return machine;
    }),
  };
  const socketHandlers = {};
  const socket = {
    on: (event, handler) => {
      socketHandlers[event] = handler;
    },
    off: vi.fn(),
  };
  const client = createE2eeClient({
    runtime,
    deviceStore: { get: vi.fn(async () => ({ deviceId: DEVICE })) },
    socketSource: (listener) => {
      listener(socket);
      return () => undefined;
    },
    loadLibraryFn: async () => library,
    unsupportedReason: () => null,
  });
  return { client, machine, socketHandlers };
}

const emptySync = {
  events: [],
  hasMore: false,
  one_time_key_counts: { signed_curve25519: 50 },
  unused_fallback_key_types: ['signed_curve25519'],
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.bindingChallenge).mockImplementation(async () => challenge());
  vi.mocked(api.syncToDevice).mockResolvedValue(emptySync);
});

describe('binding', () => {
  it('signs only a well-formed challenge for its own device', async () => {
    const { client, machine } = setup();
    expect((await client.start(USER)).status).toBe('ready');
    expect(machine.sign).toHaveBeenCalledWith(
      expect.stringMatching(/^connect-e2ee-device-binding:v1:/),
    );
    expect(api.bindDevice).toHaveBeenCalledWith(DEVICE, expect.any(String), 'S'.repeat(86));

    for (const bad of ['{"key":"x","signatures":{}}', challenge('ZZZZZZZZZZ'), `x${challenge()}`]) {
      const other = setup();
      vi.mocked(api.bindingChallenge).mockResolvedValueOnce(bad);
      const state = await other.client.start(USER);
      expect(state).toMatchObject({ status: 'failed', error: 'E2EE_INVALID_CHALLENGE' });
      expect(other.machine.sign).not.toHaveBeenCalled();
    }
  });

  it('does nothing on a browser where encryption was never set up', async () => {
    const { client } = setup();
    const offClient = createE2eeClient({
      runtime: { getState: () => ({}), getMachine: () => null, ensureReady: vi.fn() },
      deviceStore: { get: vi.fn(async () => null) },
      socketSource: () => () => undefined,
      loadLibraryFn: async () => library,
      unsupportedReason: () => null,
    });
    expect((await offClient.start(USER)).status).toBe('off');
    expect(api.bindingChallenge).not.toHaveBeenCalled();
    expect(client).toBeTruthy();
  });
});

describe('to-device queue', () => {
  it('acknowledges a batch only with the request after processing it', async () => {
    const { client, machine } = setup();
    const event = (seq) => ({
      seq,
      sender: `@${PEER}:connect`,
      type: 'm.room.encrypted',
      content: {},
    });
    vi.mocked(api.syncToDevice)
      .mockResolvedValueOnce({ ...emptySync, events: [event(1), event(2)] })
      .mockResolvedValueOnce({ ...emptySync, events: [event(3)] })
      .mockResolvedValue(emptySync);
    await client.start(USER);
    expect(vi.mocked(api.syncToDevice).mock.calls.map(([, ack]) => ack)).toEqual([0, 2, 3]);
    expect(machine.receiveSyncChanges).toHaveBeenCalledTimes(3);
    // Each batch went to the library before the next request acknowledged it.
    const [events, , counts, fallback] = machine.receiveSyncChanges.mock.calls[0];
    expect(JSON.parse(events)).toHaveLength(2);
    expect(counts).toEqual(new Map([['signed_curve25519', 50]]));
    expect(fallback).toEqual(new Set(['signed_curve25519']));
  });

  it('a failed processing step is not acknowledged', async () => {
    const { client, machine } = setup();
    vi.mocked(api.syncToDevice).mockResolvedValueOnce({
      ...emptySync,
      events: [{ seq: 1, sender: 'x', type: 'm.room.encrypted', content: {} }],
    });
    machine.receiveSyncChanges.mockRejectedValueOnce(new Error('boom'));
    await client.start(USER);
    vi.mocked(api.syncToDevice).mockResolvedValue(emptySync);
    await client.syncNow();
    expect(vi.mocked(api.syncToDevice).mock.calls.at(-1)[1]).toBe(0);
  });

  it('syncs on hints for its own device; "keys low" at most once a minute', async () => {
    const { client, socketHandlers } = setup();
    await client.start(USER);
    const before = vi.mocked(api.syncToDevice).mock.calls.length;
    socketHandlers['e2ee:to-device']({ deviceId: 'OTHERDEVIC' });
    await flush();
    expect(api.syncToDevice).toHaveBeenCalledTimes(before);
    socketHandlers['e2ee:to-device']({ deviceId: DEVICE });
    await flush();
    await client.syncNow();
    const afterHint = vi.mocked(api.syncToDevice).mock.calls.length;
    expect(afterHint).toBeGreaterThan(before);
    socketHandlers['e2ee:keys-low']({ deviceId: DEVICE });
    await client.syncNow();
    const afterFirstLow = vi.mocked(api.syncToDevice).mock.calls.length;
    socketHandlers['e2ee:keys-low']({ deviceId: DEVICE });
    await flush();
    expect(vi.mocked(api.syncToDevice).mock.calls.length).toBe(afterFirstLow);
  });
});

describe('encrypt', () => {
  const conversation = { id: 'c1', type: 'direct', peer: { id: PEER } };

  it('shares the key with both people, then encrypts; a failed share drops the key', async () => {
    const { client, machine } = setup();
    await client.start(USER);
    await client.encrypt(conversation, { msgtype: 'm.text', body: 'hi' });
    expect(api.sendToDevice).toHaveBeenCalledWith('t1', 'm.room.encrypted', {});
    expect(machine.markRequestAsSent).toHaveBeenCalledWith('t1', 3, '{}');
    expect(machine.encryptRoomEvent).toHaveBeenCalledTimes(1);

    vi.mocked(api.sendToDevice).mockRejectedValueOnce(
      Object.assign(new Error('x'), { code: 'NETWORK_ERROR' }),
    );
    await expect(
      client.encrypt(conversation, { msgtype: 'm.text', body: 'hi' }),
    ).rejects.toBeTruthy();
    expect(machine.invalidateGroupSession).toHaveBeenCalledTimes(1);
    expect(machine.encryptRoomEvent).toHaveBeenCalledTimes(1); // nothing encrypted with that key
  });

  it('refuses when the other person has no device, and when not ready', async () => {
    const { client, machine } = setup({ peerDevices: 0 });
    await expect(client.encrypt(conversation, {})).rejects.toMatchObject({
      code: 'E2EE_NOT_READY',
    });
    await client.start(USER);
    await expect(client.encrypt(conversation, {})).rejects.toMatchObject({
      code: 'E2EE_PEER_NO_DEVICE',
    });
    expect(machine.encryptRoomEvent).not.toHaveBeenCalled();
  });
});

describe('decrypt', () => {
  const message = (overrides = {}) => ({
    id: 'm1',
    rev: 0,
    conversationId: 'c1',
    senderId: PEER,
    clientMessageId: 'cid-1',
    createdAt: new Date().toISOString(),
    encryption: 'e2ee_v1',
    encrypted: { algorithm: 'm.megolm.v1.aes-sha2' },
    ...overrides,
  });
  const decryptedAs = ({
    shield = 2,
    device = 'SENDERDEVI',
    curve = SENDER_CURVE,
    cid = 'cid-1',
  } = {}) => ({
    shieldState: () => ({ code: shield }),
    senderDevice: device ? { toString: () => device } : undefined,
    senderCurve25519Key: curve,
    event: JSON.stringify({
      content: { msgtype: 'm.text', body: 'secret', 'connect.message': { clientMessageId: cid } },
    }),
  });

  async function resultOf(client, item) {
    client.request(item);
    for (let i = 0; i < 20 && !client.resultFor(item); i++) await flush();
    return client.resultFor(item);
  }

  it('reports a sender device as verified only when the library says so', async () => {
    const { client } = setup({ decrypted: () => decryptedAs(), senderVerified: true });
    await client.start(USER);
    expect(await resultOf(client, message())).toMatchObject({ status: 'ok', verified: true });
  });

  it('accepts a message from the sender’s own device that names this message', async () => {
    const { client } = setup({ decrypted: () => decryptedAs() });
    await client.start(USER);
    expect(await resultOf(client, message())).toMatchObject({
      status: 'ok',
      content: { body: 'secret' },
      verified: false,
    });
  });

  it.each([
    ['a relabelled sender', { shield: 5 }, 'mismatched_sender'],
    ['a device that isn’t the sender’s', { device: 'OTHERDEVIC' }, 'unknown_sender_device'],
    [
      'a different key than the sender device’s',
      { curve: 'D'.repeat(43) },
      'unknown_sender_device',
    ],
    ['a ciphertext moved to another message', { cid: 'cid-other' }, 'mismatched_message'],
  ])('rejects %s', async (_, options, reason) => {
    const { client } = setup({ decrypted: () => decryptedAs(options) });
    await client.start(USER);
    expect(await resultOf(client, message())).toEqual({ status: 'failed', reason });
  });

  it('rejects the same message replayed under another id', async () => {
    const { client } = setup({ decrypted: () => decryptedAs() });
    await client.start(USER);
    expect((await resultOf(client, message())).status).toBe('ok');
    expect(await resultOf(client, message({ id: 'm2' }))).toEqual({
      status: 'failed',
      reason: 'replayed',
    });
  });

  it('waits for a missing key and retries after the next sync', async () => {
    let attempt = 0;
    const { client } = setup({
      decrypted: () => {
        attempt += 1;
        if (attempt === 1) throw new MegolmDecryptionError(0);
        return decryptedAs();
      },
    });
    await client.start(USER);
    const item = message();
    expect(await resultOf(client, item)).toEqual({ status: 'waiting' });
    await client.syncNow();
    expect(client.resultFor(item)).toBeUndefined(); // cleared for a retry
    expect((await resultOf(client, item)).status).toBe('ok');
  });
});
