/**
 * Test-only page for the multi-page E2EE tests (e2ee.e2e.test.js). It uses the app's real runtime
 * singleton and device store, exactly as Connect does, and exposes only non-secret results
 * (status, device id, public identity key, database names) to the test driver.
 */
import { cryptoRuntime } from '../src/features/e2ee/crypto-runtime';
import { getDeviceRecord } from '../src/features/e2ee/device-store';

const summary = (machine) => ({
  ...cryptoRuntime.getState(),
  identityKey: machine ? machine.identityKeys.ed25519.toBase64() : null,
  machineUserId: machine ? machine.userId.toString() : null,
});

window.harness = {
  async ensureReady(userId) {
    return summary(await cryptoRuntime.ensureReady(userId));
  },
  state: () => cryptoRuntime.getState(),
  close: () => cryptoRuntime.close(),
  forget: (userId) => cryptoRuntime.forgetDevice(userId),
  async record(userId) {
    const record = await getDeviceRecord(userId);
    return record ? { deviceId: record.deviceId, storeName: record.storeName } : null;
  },
  async databases() {
    return (await indexedDB.databases()).map((db) => db.name).sort();
  },
};
document.getElementById('status').textContent = 'ready';
