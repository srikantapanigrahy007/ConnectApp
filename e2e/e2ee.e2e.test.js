/**
 * Real reloads and real tabs (Phase 15, Stage B, checkpoint A validation).
 *
 * Node drives the installed Google Chrome through Playwright. Each test uses ONE browser context
 * (shared origin, IndexedDB and Web Locks, like tabs of one browser profile) and real pages
 * loaded from the app's own Vite dev server (`e2e/e2ee-harness.html`, which uses the app's real
 * runtime). `page.reload()` is a literal reload; two `context.newPage()` pages are two tabs.
 *
 *   npm run test:e2e
 */
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const ALICE = '64b0000000000000000000a1';
const BOB = '64b0000000000000000000b2';
const root = fileURLToPath(new URL('..', import.meta.url));

let server;
let browser;
let context;
let url;

beforeAll(async () => {
  // The app's real Vite config (plugins, dependency optimizer), on a free port instead of 5173.
  server = await createServer({
    root,
    configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)),
    server: { port: 0, strictPort: false, hmr: false },
    logLevel: 'error',
  });
  await server.listen();
  const { port } = server.httpServer.address();
  url = `http://localhost:${port}/e2e/e2ee-harness.html`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
});

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

beforeEach(async () => {
  context = await browser.newContext(); // fresh, empty storage for every test
});
afterEach(async () => {
  await context?.close();
});

async function openTab({ withoutWebLocks = false, withoutDatabaseList = false } = {}) {
  const page = await context.newPage();
  if (withoutWebLocks) {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'locks', { get: () => undefined });
    });
  }
  if (withoutDatabaseList) {
    await page.addInitScript(() => {
      delete IDBFactory.prototype.databases;
    });
  }
  await page.goto(url);
  await page.waitForFunction(() => window.harness);
  return page;
}

const call = (page, method, ...args) =>
  page.evaluate(([name, values]) => window.harness[name](...values), [method, args]);

describe('literal page reload', () => {
  it('reopens the same device with the same identity after a real reload', async () => {
    const tab = await openTab();
    const before = await call(tab, 'ensureReady', ALICE);
    expect(before).toMatchObject({ status: 'ready', machineUserId: `@${ALICE}:connect` });

    await tab.reload();
    await tab.waitForFunction(() => window.harness);
    expect(await call(tab, 'state')).toMatchObject({ status: 'idle' }); // fresh JS runtime
    const after = await call(tab, 'ensureReady', ALICE);
    expect(after).toMatchObject({
      status: 'ready',
      deviceId: before.deviceId,
      identityKey: before.identityKey,
    });

    // Another account in the same page gets its own device, never Alice's.
    const bob = await call(tab, 'ensureReady', BOB);
    expect(bob.machineUserId).toBe(`@${BOB}:connect`);
    expect(bob.deviceId).not.toBe(before.deviceId);
    expect(bob.identityKey).not.toBe(before.identityKey);
  });
});

describe('two real tabs', () => {
  it('never open the same device at once, even when they race to create it', async () => {
    const [one, two] = await Promise.all([openTab(), openTab()]);
    const results = await Promise.all([
      call(one, 'ensureReady', ALICE),
      call(two, 'ensureReady', ALICE),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(['ready', 'unavailable']);
    expect(results.find((result) => result.status === 'unavailable').error).toBe(
      'open_in_another_tab',
    );
    // Exactly one device was created for Alice.
    const record = await call(one, 'record', ALICE);
    expect(record.deviceId).toBe(results.find((result) => result.status === 'ready').deviceId);
  });

  it('closing the owning tab releases the lock; the other tab then opens the same device', async () => {
    const one = await openTab();
    const two = await openTab();
    const owner = await call(one, 'ensureReady', ALICE);
    expect(await call(two, 'ensureReady', ALICE)).toMatchObject({ status: 'unavailable' });

    await one.close(); // the browser releases the page's locks shortly afterwards
    // Release is asynchronous: retry (as the app would) until it's free, within a few seconds.
    let takeover;
    for (let attempt = 0; attempt < 30; attempt++) {
      takeover = await call(two, 'ensureReady', ALICE);
      if (takeover.status === 'ready') break;
      await two.waitForTimeout(100);
    }
    expect(takeover).toMatchObject({
      status: 'ready',
      deviceId: owner.deviceId,
      identityKey: owner.identityKey,
    });
  });

  it('reloading the owning tab does not leave the device locked', async () => {
    const one = await openTab();
    const two = await openTab();
    const owner = await call(one, 'ensureReady', ALICE);
    await one.reload();
    await one.waitForFunction(() => window.harness);
    // The reloaded page no longer holds it: the other tab can take it…
    expect(await call(two, 'ensureReady', ALICE)).toMatchObject({
      status: 'ready',
      deviceId: owner.deviceId,
    });
    // …and the reloaded page is refused while that tab has it.
    expect(await call(one, 'ensureReady', ALICE)).toMatchObject({
      status: 'unavailable',
      error: 'open_in_another_tab',
    });
  });

  it('different accounts in two tabs get separate devices; no cross-account reuse', async () => {
    const one = await openTab();
    const two = await openTab();
    const alice = await call(one, 'ensureReady', ALICE);
    const bob = await call(two, 'ensureReady', BOB);
    expect(bob.status).toBe('ready');
    expect(bob.deviceId).not.toBe(alice.deviceId);
    // Tab two switches to Alice while tab one has her device open: refused, not shared.
    expect(await call(two, 'ensureReady', ALICE)).toMatchObject({ status: 'unavailable' });
    expect(await call(two, 'state')).toMatchObject({ userId: ALICE, status: 'unavailable' });
  });

  it('without Web Locks the runtime refuses to open anything (fails safe)', async () => {
    const tab = await openTab({ withoutWebLocks: true });
    expect(await tab.evaluate(() => typeof navigator.locks)).toBe('undefined');
    expect(await call(tab, 'ensureReady', ALICE)).toMatchObject({
      status: 'unavailable',
      error: 'no_web_locks',
    });
    expect(await call(tab, 'record', ALICE)).toBeNull(); // nothing created
  });
});

describe('forgetting a device', () => {
  it("removes only this account's device: its record and its library databases", async () => {
    const tab = await openTab();
    await call(tab, 'ensureReady', BOB);
    const bobRecord = await call(tab, 'record', BOB);
    await call(tab, 'ensureReady', ALICE);
    const aliceRecord = await call(tab, 'record', ALICE);
    const before = await call(tab, 'databases');
    expect(before.filter((name) => name.startsWith(`${aliceRecord.storeName}::`)).length).toBe(2);

    const result = await call(tab, 'forget', ALICE);
    expect(result).toMatchObject({ forgotten: true, remaining: [] });
    expect(await call(tab, 'state')).toMatchObject({ status: 'idle' }); // closed first
    expect(await call(tab, 'record', ALICE)).toBeNull();
    const after = await call(tab, 'databases');
    expect(after.some((name) => name.startsWith(`${aliceRecord.storeName}::`))).toBe(false);
    // Bob's device is untouched and still opens with its identity.
    expect(after.filter((name) => name.startsWith(`${bobRecord.storeName}::`)).length).toBe(2);
    expect((await call(tab, 'ensureReady', BOB)).deviceId).toBe(bobRecord.deviceId);
    // Alice gets a brand-new device next time.
    expect((await call(tab, 'ensureReady', ALICE)).deviceId).not.toBe(aliceRecord.deviceId);
  });

  it('reports a database still in use instead of claiming success, and keeps the record', async () => {
    const tab = await openTab();
    await call(tab, 'ensureReady', ALICE);
    const record = await call(tab, 'record', ALICE);
    await call(tab, 'close');
    // Another page holds a raw connection to the device's store (and ignores requests to close).
    const holder = await openTab();
    await holder.evaluate(
      (name) =>
        new Promise((resolve) => {
          const opening = indexedDB.open(name);
          opening.onsuccess = () => {
            window.heldConnection = opening.result; // never closed, no onversionchange handler
            resolve();
          };
        }),
      `${record.storeName}::matrix-sdk-crypto`,
    );

    const result = await call(tab, 'forget', ALICE);
    expect(result).toMatchObject({ forgotten: false, reason: 'database_in_use' });
    expect(result.remaining).toContain(`${record.storeName}::matrix-sdk-crypto`);
    // The record is kept, and the possibly half-deleted device is never reopened…
    expect(await call(tab, 'record', ALICE)).toMatchObject({ deviceId: record.deviceId });
    expect(await call(tab, 'ensureReady', ALICE)).toMatchObject({
      status: 'failed',
      error: 'deletion_pending',
    });
    // …until forgetting succeeds once the other connection is gone.
    await holder.evaluate(() => window.heldConnection.close());
    expect(await call(tab, 'forget', ALICE)).toMatchObject({ forgotten: true, remaining: [] });
    expect(await call(tab, 'record', ALICE)).toBeNull();
    expect((await call(tab, 'ensureReady', ALICE)).deviceId).not.toBe(record.deviceId);
  });

  it('deletes nothing when the browser cannot list databases', async () => {
    const tab = await openTab({ withoutDatabaseList: true });
    await call(tab, 'ensureReady', ALICE);
    const record = await call(tab, 'record', ALICE);
    expect(await call(tab, 'forget', ALICE)).toMatchObject({
      forgotten: false,
      reason: 'cannot_list_databases',
    });
    expect(await call(tab, 'record', ALICE)).toMatchObject({ deviceId: record.deviceId });
  });

  it('is refused while another tab has the device open (nothing is deleted)', async () => {
    const one = await openTab();
    const two = await openTab();
    const owner = await call(one, 'ensureReady', ALICE);
    const record = await call(one, 'record', ALICE);

    expect(await call(two, 'forget', ALICE)).toMatchObject({
      forgotten: false,
      reason: 'open_in_another_tab',
    });
    expect(await call(two, 'record', ALICE)).toMatchObject({ deviceId: owner.deviceId });
    const names = await call(two, 'databases');
    expect(names.filter((name) => name.startsWith(`${record.storeName}::`)).length).toBe(2);
    // The owning tab keeps working.
    expect(await call(one, 'state')).toMatchObject({ status: 'ready' });
  });
});
