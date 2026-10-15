/**
 * Unit tests (jsdom, fake machine and mocked API) for the request handling around the library.
 * Real devices are used in key-exchange.browser.test.js (Chrome) and backend/test/e2ee-keys.test.js.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from './api';
import { registerCurrentDevice } from './device-registration';
import { establishSessions, syncKeyCounts, uploadDeviceKeys } from './key-exchange';

vi.mock('@matrix-org/matrix-sdk-crypto-wasm', () => ({
  RequestType: { KeysUpload: 0, KeysQuery: 1, KeysClaim: 2 },
  DeviceLists: class {},
  UserId: class {
    constructor(id) {
      this.id = id;
    }
  },
}));
vi.mock('./api', () => ({
  uploadKeys: vi.fn(),
  keyCounts: vi.fn(),
  queryKeys: vi.fn(),
  claimKeys: vi.fn(),
}));
vi.mock('./device-registration', () => ({ registerCurrentDevice: vi.fn() }));

const USER = '64b0000000000000000000a1';
const DEVICE = 'ABCDEFGHIJ';
const apiError = (code) => Object.assign(new Error('refused'), { code });
const counts = (n) => ({ one_time_key_counts: { signed_curve25519: n } });

function fakeRuntime({ status = 'ready', uploads = 1, devices = [] } = {}) {
  let remaining = uploads;
  const machine = {
    outgoingRequests: vi.fn(async () =>
      remaining > 0 ? [{ id: `u${remaining}`, type: 0, body: '{"one_time_keys":{}}' }] : [],
    ),
    markRequestAsSent: vi.fn(async (id, type) => {
      if (type === 0) remaining -= 1;
    }),
    receiveSyncChanges: vi.fn(async () => []),
    updateTrackedUsers: vi.fn(async () => undefined),
    getMissingSessions: vi.fn(async () => null),
    getUserDevices: vi.fn(async () => ({ devices: () => devices })),
  };
  return {
    machine,
    runtime: {
      getState: () => ({ status, userId: USER, deviceId: DEVICE, error: null }),
      getMachine: () => (status === 'ready' ? machine : null),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('uploadDeviceKeys', () => {
  it('acknowledges an upload to the library only after the API accepted it', async () => {
    const { runtime, machine } = fakeRuntime({ uploads: 2 });
    vi.mocked(api.uploadKeys).mockResolvedValue(counts(50));
    expect(await uploadDeviceKeys(runtime)).toEqual({ status: 'up_to_date', uploaded: 2 });
    expect(machine.markRequestAsSent).toHaveBeenCalledWith('u2', 0, JSON.stringify(counts(50)));

    const failing = fakeRuntime();
    vi.mocked(api.uploadKeys).mockRejectedValue(apiError('INVALID_KEY_SIGNATURE'));
    expect(await uploadDeviceKeys(failing.runtime)).toEqual({
      status: 'failed',
      reason: 'INVALID_KEY_SIGNATURE',
      uploaded: 0,
    });
    expect(failing.machine.markRequestAsSent).not.toHaveBeenCalled();
  });

  it('registers an unknown device once, then sends the same upload again', async () => {
    const { runtime, machine } = fakeRuntime();
    vi.mocked(api.uploadKeys)
      .mockRejectedValueOnce(apiError('DEVICE_NOT_REGISTERED'))
      .mockResolvedValueOnce(counts(50));
    vi.mocked(registerCurrentDevice).mockResolvedValue({ registered: true, device: {} });
    expect(await uploadDeviceKeys(runtime)).toEqual({ status: 'up_to_date', uploaded: 1 });
    expect(registerCurrentDevice).toHaveBeenCalledTimes(1);
    expect(api.uploadKeys.mock.calls[0]).toEqual(api.uploadKeys.mock.calls[1]);
    expect(machine.markRequestAsSent).toHaveBeenCalledTimes(1);

    const refused = fakeRuntime();
    vi.mocked(api.uploadKeys).mockRejectedValue(apiError('DEVICE_NOT_REGISTERED'));
    expect((await uploadDeviceKeys(refused.runtime)).reason).toBe('DEVICE_NOT_REGISTERED');
    expect(registerCurrentDevice).toHaveBeenCalledTimes(2); // once per call, no loop
  });

  it('never reports error messages, only fixed codes', async () => {
    const { runtime } = fakeRuntime();
    vi.mocked(api.uploadKeys).mockRejectedValue(new Error('key AAAA… is bad'));
    expect(await uploadDeviceKeys(runtime)).toEqual({
      status: 'failed',
      reason: 'unexpected_error',
      uploaded: 0,
    });
  });

  it('does nothing unless a device is open', async () => {
    for (const status of ['idle', 'initializing', 'failed', 'unavailable']) {
      const { runtime } = fakeRuntime({ status });
      expect((await uploadDeviceKeys(runtime)).reason).toBe('device_not_open');
      expect((await syncKeyCounts(runtime)).reason).toBe('device_not_open');
      expect((await establishSessions([USER], runtime)).reason).toBe('device_not_open');
    }
    expect(api.uploadKeys).not.toHaveBeenCalled();
    expect(api.keyCounts).not.toHaveBeenCalled();
  });

  it('runs one key operation at a time per device', async () => {
    const { runtime } = fakeRuntime({ uploads: 2 });
    let active = 0;
    let most = 0;
    vi.mocked(api.uploadKeys).mockImplementation(async () => {
      active += 1;
      most = Math.max(most, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return counts(50);
    });
    const results = await Promise.all([uploadDeviceKeys(runtime), uploadDeviceKeys(runtime)]);
    expect(most).toBe(1);
    expect(results.map((result) => result.uploaded).sort()).toEqual([0, 2]);
  });
});

describe('syncKeyCounts', () => {
  it("passes the server's counts and unused fallback types to the library, then uploads", async () => {
    const { runtime, machine } = fakeRuntime();
    vi.mocked(api.keyCounts).mockResolvedValue({
      ...counts(12),
      unused_fallback_key_types: ['signed_curve25519'],
    });
    vi.mocked(api.uploadKeys).mockResolvedValue(counts(50));
    expect(await syncKeyCounts(runtime)).toEqual({ status: 'up_to_date', uploaded: 1 });
    const [events, , oneTimeCounts, unusedFallback] = machine.receiveSyncChanges.mock.calls[0];
    expect(events).toBe('[]');
    expect(oneTimeCounts).toEqual(new Map([['signed_curve25519', 12]]));
    expect(unusedFallback).toEqual(new Set(['signed_curve25519']));
  });
});

describe('establishSessions', () => {
  const device = (deviceId, { session = true, verified = false } = {}) => ({
    deviceId: { toString: () => deviceId },
    isDeleted: () => false,
    isVerified: () => verified,
    encryptToDeviceEvent: vi.fn(async () => {
      if (!session) throw new Error('device does not have a valid Olm session');
      return '{}';
    }),
  });

  it('reports each device by what the claim did, and leaves out this device', async () => {
    const others = [device('NOKEYNOKEY'), device('CLAIMEDKEY'), device('SKIPPEDSKI')];
    const { runtime, machine } = fakeRuntime({ uploads: 0, devices: [device(DEVICE), ...others] });
    const target = `@${USER}:connect`;
    const claim = {
      id: 'c',
      type: 2,
      body: JSON.stringify({
        one_time_keys: {
          [target]: { NOKEYNOKEY: 'signed_curve25519', CLAIMEDKEY: 'signed_curve25519' },
        },
      }),
    };
    machine.getMissingSessions.mockResolvedValue(claim);
    vi.mocked(api.claimKeys).mockResolvedValue({
      one_time_keys: { [target]: { CLAIMEDKEY: { 'signed_curve25519:AAAA': {} } } },
      failures: {},
    });
    const result = await establishSessions([USER], runtime);
    expect(result.devices).toEqual([
      { userId: USER, deviceId: 'NOKEYNOKEY', status: 'no_one_time_key', verified: false },
      { userId: USER, deviceId: 'CLAIMEDKEY', status: 'key_claimed', verified: false },
      { userId: USER, deviceId: 'SKIPPEDSKI', status: 'not_requested', verified: false },
    ]);
    // Nothing is encrypted just to probe a session (no message is spent).
    for (const item of others) expect(item.encryptToDeviceEvent).not.toHaveBeenCalled();
    expect(machine.markRequestAsSent).toHaveBeenCalledWith(
      'c',
      2,
      JSON.stringify(await api.claimKeys.mock.results[0].value),
    );
  });

  it('a failed claim is not acknowledged and reports no devices', async () => {
    const { runtime, machine } = fakeRuntime({ uploads: 0 });
    machine.getMissingSessions.mockResolvedValue({
      id: 'c',
      type: 2,
      body: '{"one_time_keys":{}}',
    });
    vi.mocked(api.claimKeys).mockRejectedValue(apiError('RATE_LIMITED'));
    expect(await establishSessions([USER], runtime)).toEqual({
      status: 'failed',
      reason: 'RATE_LIMITED',
      devices: [],
    });
    expect(machine.markRequestAsSent).not.toHaveBeenCalled();
  });
});
