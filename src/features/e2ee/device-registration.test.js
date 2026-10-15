/**
 * Unit tests (jsdom, fake machine and mocked API). The real library and a real device are used
 * in device-registration.browser.test.js.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from './api';
import { registerCurrentDevice } from './device-registration';

vi.mock('@matrix-org/matrix-sdk-crypto-wasm', () => ({
  RequestType: { KeysUpload: 0, KeysQuery: 1 },
}));
vi.mock('./api', () => ({ registerDevice: vi.fn(async (deviceId) => ({ deviceId })) }));

const USER = '64b0000000000000000000a1';
const DEVICE = 'ABCDEFGHIJ';
const ED = 'E'.repeat(43);
const CURVE = 'C'.repeat(43);

function fakeRuntime({ status = 'ready', keys = {}, requests } = {}) {
  const deviceKeys = {
    user_id: `@${USER}:connect`,
    device_id: DEVICE,
    algorithms: ['m.olm.v1.curve25519-aes-sha2', 'm.megolm.v1.aes-sha2'],
    keys: { [`ed25519:${DEVICE}`]: ED, [`curve25519:${DEVICE}`]: CURVE, ...keys },
    signatures: { [`@${USER}:connect`]: { [`ed25519:${DEVICE}`]: 'S'.repeat(86) } },
  };
  const machine = {
    identityKeys: { ed25519: { toBase64: () => ED }, curve25519: { toBase64: () => CURVE } },
    outgoingRequests: vi.fn(
      async () =>
        requests ?? [
          { id: 'q', type: 1, body: '{}' },
          {
            id: 'u',
            type: 0,
            body: JSON.stringify({ device_keys: deviceKeys, one_time_keys: { x: {} } }),
          },
        ],
    ),
    markRequestAsSent: vi.fn(),
  };
  return {
    machine,
    deviceKeys,
    runtime: {
      getState: () => ({ status, userId: USER, deviceId: DEVICE, error: null }),
      getMachine: () => (status === 'ready' ? machine : null),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('registerCurrentDevice', () => {
  it('sends only the signed public keys of the open device, and never acknowledges the upload', async () => {
    const { runtime, machine, deviceKeys } = fakeRuntime();
    expect(await registerCurrentDevice(runtime)).toEqual({
      registered: true,
      device: { deviceId: DEVICE },
    });
    expect(api.registerDevice).toHaveBeenCalledWith(DEVICE, deviceKeys);
    expect(JSON.stringify(vi.mocked(api.registerDevice).mock.calls)).not.toContain('one_time');
    // One-time keys stay unpublished on the device until checkpoint C.
    expect(machine.markRequestAsSent).not.toHaveBeenCalled();
  });

  it('does nothing unless a device is already open (never opens one itself)', async () => {
    for (const status of ['idle', 'initializing', 'failed', 'unavailable']) {
      const { runtime } = fakeRuntime({ status });
      expect(await registerCurrentDevice(runtime)).toEqual({
        registered: false,
        reason: 'device_not_open',
      });
    }
    expect(api.registerDevice).not.toHaveBeenCalled();
  });

  it("refuses keys that don't match the open device", async () => {
    const { runtime } = fakeRuntime({ keys: { [`ed25519:${DEVICE}`]: 'X'.repeat(43) } });
    expect(await registerCurrentDevice(runtime)).toEqual({
      registered: false,
      reason: 'keys_mismatch',
    });
    const none = fakeRuntime({ requests: [] });
    expect(await registerCurrentDevice(none.runtime)).toEqual({
      registered: false,
      reason: 'keys_unavailable',
    });
    expect(api.registerDevice).not.toHaveBeenCalled();
  });
});
