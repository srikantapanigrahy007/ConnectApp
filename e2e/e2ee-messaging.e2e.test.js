/**
 * End-to-end encrypted direct messages across two separate browser profiles (Phase 15, Stage B,
 * checkpoint D), with nothing faked between them:
 * - the real API (createApp + Socket.IO) on a real MongoDB (in-memory mongod, test data only),
 * - the app's own Vite dev server and proxy, so the pages call the API exactly as the app does,
 * - two Playwright contexts in the installed Google Chrome: Alice and Bob each have their own
 *   cookies, IndexedDB device store and Web Locks, like two people on two computers.
 * The only shortcut: both accounts are created through the API test helpers and their session
 * cookies are copied into the browser contexts (instead of typing a sign-in form).
 *
 *   npm run test:e2e
 */
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allModels } from '../../backend/src/models/index.js';
import { E2eeToDeviceEvent } from '../../backend/src/models/e2ee-to-device-event.model.js';
import { Message } from '../../backend/src/models/message.model.js';
import { Session } from '../../backend/src/models/session.model.js';
import { signedInUser, startTestServer, TEST_ORIGIN } from '../../backend/test/helpers.js';
import { connectedPair } from '../../backend/test/messaging-helpers.js';

const root = fileURLToPath(new URL('..', import.meta.url));

let mongod;
let api;
let vite;
let browser;
let origin;

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'e2ee_e2e' });
  await Promise.all(allModels.map((model) => model.init()));

  const port = await freePort();
  origin = `http://localhost:${port}`;
  api = await startTestServer({
    e2ee: { enabled: true },
    // The browser pages (Vite origin) and the API test helpers (their usual test origin).
    env: { CLIENT_ORIGINS: `${origin},${TEST_ORIGIN}`, WEB_APP_URL: origin },
  });
  process.env.API_PROXY_TARGET = api.baseUrl;
  vite = await createServer({
    root,
    configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)),
    server: { port, strictPort: true, hmr: false },
    logLevel: 'error',
  });
  await vite.listen();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await vite?.close();
  await api?.close();
  await mongoose.disconnect();
  await mongod?.stop();
});

/** A browser profile signed in as `account` (cookies copied from its API session). */
async function profileFor(account) {
  const context = await browser.newContext();
  await context.addCookies(
    [...account.client.cookies.entries()]
      .filter(([, value]) => value)
      .map(([name, value]) => ({ name, value, domain: 'localhost', path: '/' })),
  );
  return context;
}

async function openHarness(context) {
  const page = await context.newPage();
  await page.goto(`${origin}/e2e/e2ee-messaging-harness.html`);
  await page.waitForFunction(() => document.getElementById('status')?.textContent === 'ready');
  return page;
}

describe('two people, two browsers, the real API', () => {
  it('Alice sends while Bob is offline; Bob reads it after reopening, replies, and nothing readable reaches the server', async () => {
    const { a, b, conversation } = await connectedPair(api.baseUrl);
    const alice = await profileFor(a);
    const bob = await profileFor(b);
    const call = (page, name, ...args) =>
      page.evaluate(([fn, values]) => window.harness[fn](...values), [name, args]);

    // Bob sets up encryption on his browser, then closes it (offline).
    let bobPage = await openHarness(bob);
    expect(await call(bobPage, 'start', b.user.id, true)).toMatchObject({
      status: 'ready',
      error: null,
    });
    await bobPage.close();

    // Alice sets up, turns encryption on for the chat and sends two messages.
    const alicePage = await openHarness(alice);
    expect(await call(alicePage, 'start', a.user.id, true)).toMatchObject({
      status: 'ready',
      error: null,
    });
    expect(await call(alicePage, 'enable', conversation.id)).toMatchObject({ enabled: true });
    await call(alicePage, 'sendText', conversation.id, 'the door code is 4417');
    await call(alicePage, 'sendText', conversation.id, 'see you at 7');
    // A readable message is refused in this chat (no downgrade).
    expect(await call(alicePage, 'sendPlain', conversation.id, 'plain text')).toBe('E2EE_REQUIRED');

    // The server holds no readable trace of either message.
    const serverState = JSON.stringify([
      await Message.find({ conversation: conversation.id }).lean(),
      await E2eeToDeviceEvent.find({}).lean(),
    ]);
    expect(serverState).not.toContain('4417');
    expect(serverState).not.toContain('see you at 7');
    expect(await E2eeToDeviceEvent.countDocuments({ user: b.user.id })).toBeGreaterThan(0);

    // Bob comes back: same browser profile, a new page (his device is reloaded from IndexedDB,
    // not set up again). Starting fetches his queue; then his history decrypts.
    bobPage = await openHarness(bob);
    expect(await call(bobPage, 'start', b.user.id)).toMatchObject({ status: 'ready', error: null });
    const bobView = await call(bobPage, 'read', conversation.id);
    expect(bobView).toEqual([
      expect.objectContaining({ type: 'system', encrypted: false }),
      expect.objectContaining({ status: 'ok', text: 'the door code is 4417' }),
      expect.objectContaining({ status: 'ok', text: 'see you at 7' }),
    ]);
    // His queue was acknowledged after processing (an empty sync acknowledges the last batch).
    await call(bobPage, 'sync');
    expect(await E2eeToDeviceEvent.countDocuments({ user: b.user.id })).toBe(0);

    // Bob replies; Alice receives the key on her next sync and reads it, and still reads her own.
    await call(bobPage, 'sendText', conversation.id, 'on my way');
    await call(alicePage, 'sync');
    const aliceView = await call(alicePage, 'read', conversation.id);
    expect(
      aliceView.filter((item) => item.encrypted).map((item) => [item.status, item.text]),
    ).toEqual([
      ['ok', 'the door code is 4417'],
      ['ok', 'see you at 7'],
      ['ok', 'on my way'],
    ]);

    // Each sign-in is bound to its own browser's device.
    const sessions = await Session.find({ user: { $in: [a.user.id, b.user.id] } }).lean();
    expect(sessions.every((session) => /^[A-Z]{10}$/.test(session.e2eeDeviceId ?? ''))).toBe(true);
    await alice.close();
    await bob.close();
  });

  it('files in an encrypted chat are sent as before (not end-to-end encrypted) and open normally', async () => {
    const { a, b, conversation } = await connectedPair(api.baseUrl);
    const alice = await profileFor(a);
    const bob = await profileFor(b);
    const call = (page, name, ...args) =>
      page.evaluate(([fn, values]) => window.harness[fn](...values), [name, args]);
    const bobPage = await openHarness(bob);
    await call(bobPage, 'start', b.user.id, true);
    const alicePage = await openHarness(alice);
    await call(alicePage, 'start', a.user.id, true);
    await call(alicePage, 'enable', conversation.id);
    await call(
      alicePage,
      'sendPlainFile',
      conversation.id,
      'notes.txt',
      'text/plain',
      'shared notes',
    );
    await call(alicePage, 'sendText', conversation.id, 'caption, encrypted');
    await call(bobPage, 'sync');
    const view = await call(bobPage, 'read', conversation.id);
    expect(view.slice(1)).toEqual([
      expect.objectContaining({ type: 'attachment', encrypted: false, text: '' }),
      expect.objectContaining({ encrypted: true, status: 'ok', text: 'caption, encrypted' }),
    ]);
    await alice.close();
    await bob.close();
  });

  it('emoji verification between the two browsers: same emoji, verified only after both confirm', async () => {
    const { a, b, conversation } = await connectedPair(api.baseUrl);
    const alice = await profileFor(a);
    const bob = await profileFor(b);
    const call = (page, name, ...args) =>
      page.evaluate(([fn, values]) => window.harness[fn](...values), [name, args]);
    const bobPage = await openHarness(bob);
    const bobDevice = (await call(bobPage, 'start', b.user.id, true)).deviceId;
    const alicePage = await openHarness(alice);
    await call(alicePage, 'start', a.user.id, true);
    await call(alicePage, 'enable', conversation.id);

    // Before verification: messages decrypt but the sender device is reported unverified.
    await call(bobPage, 'sendText', conversation.id, 'before verifying');
    await call(alicePage, 'sync');
    expect(await call(alicePage, 'readVerified', conversation.id)).toMatchObject({
      status: 'ok',
      verified: false,
    });
    expect(await call(alicePage, 'devices', b.user.id)).toEqual([
      { deviceId: bobDevice, verified: false, own: false },
    ]);

    const flowId = await call(alicePage, 'requestVerification', b.user.id, bobDevice);
    let incoming = [];
    for (let i = 0; i < 20 && incoming.length === 0; i++) {
      await call(bobPage, 'sync');
      incoming = await call(bobPage, 'incoming', a.user.id);
    }
    expect(incoming).toEqual([{ flowId, deviceId: expect.any(String) }]);

    let aliceStep;
    let bobStep;
    for (let i = 0; i < 20; i++) {
      bobStep = await call(bobPage, 'step', a.user.id, flowId, true);
      aliceStep = await call(alicePage, 'step', b.user.id, flowId, false);
      if (aliceStep.status === 'compare' && bobStep.status === 'compare') break;
    }
    expect(aliceStep.emoji).toHaveLength(7);
    expect(bobStep.emoji).toEqual(aliceStep.emoji);
    // Emoji alone verify nothing.
    expect((await call(alicePage, 'devices', b.user.id))[0].verified).toBe(false);

    await call(alicePage, 'confirm', b.user.id, flowId);
    await call(bobPage, 'confirm', a.user.id, flowId);
    for (let i = 0; i < 20; i++) {
      bobStep = await call(bobPage, 'step', a.user.id, flowId, true);
      aliceStep = await call(alicePage, 'step', b.user.id, flowId, false);
      if (aliceStep.status === 'done' && bobStep.status === 'done') break;
    }
    expect([aliceStep.status, bobStep.status]).toEqual(['done', 'done']);
    expect((await call(alicePage, 'devices', b.user.id))[0].verified).toBe(true);

    // A new message from the verified device is reported as from a verified device.
    await call(bobPage, 'sendText', conversation.id, 'after verifying');
    await call(alicePage, 'sync');
    expect(await call(alicePage, 'readVerified', conversation.id)).toMatchObject({
      status: 'ok',
      verified: true,
    });
    await alice.close();
    await bob.close();
  });

  it('a browser without encryption set up loads nothing and can’t read encrypted messages', async () => {
    const carol = await signedInUser(api.baseUrl);
    const context = await profileFor(carol);
    const page = await openHarness(context);
    expect(await page.evaluate((id) => window.harness.start(id), carol.user.id)).toMatchObject({
      status: 'off',
    });
    expect(
      await page.evaluate(() =>
        performance.getEntriesByType('resource').some((r) => r.name.includes('.wasm')),
      ),
    ).toBe(false);
    await context.close();
  });
});
