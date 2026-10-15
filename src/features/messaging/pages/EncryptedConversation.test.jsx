/**
 * An end-to-end encrypted direct chat in the real conversation screen (jsdom), with the crypto
 * client replaced by a fake: what is sent, what is shown, and that nothing readable ever goes to
 * the API. The real library and API are covered in backend/test/e2ee-messaging.test.js and
 * frontend/e2e/e2ee-messaging.e2e.test.js.
 */
import { configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { testSession, testUser } from '../../../test/auth-fixtures';
import { renderRoute } from '../../../test/render';
import * as authApi from '../../auth/api';
import { e2eeClient } from '../../e2ee/e2ee-client';
import * as messagingApi from '../api';
import { resetMessagingStore } from '../store';

vi.mock('../../auth/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getSession: vi.fn(),
}));
vi.mock('../api', () => ({
  listConversations: vi.fn(),
  getConversation: vi.fn(),
  openConversation: vi.fn(),
  listMessages: vi.fn(),
  sendMessage: vi.fn(),
  editMessage: vi.fn(),
  uploadAttachment: vi.fn(),
}));
vi.mock('../../e2ee/api', () => ({
  serverStatus: vi.fn(async () => ({ enabled: true })),
  conversationStatus: vi.fn(),
}));
vi.mock('../../e2ee/e2ee-client', () => {
  const listeners = new Set();
  let state = { status: 'ready', userId: null, deviceId: 'ABCDEFGHIJ', error: null };
  const results = new Map();
  const client = {
    getState: () => state,
    getVersion: () => results.size,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setState(next) {
      state = { ...state, ...next };
      for (const listener of listeners) listener();
    },
    start: vi.fn(async () => state),
    stop: vi.fn(),
    encrypt: vi.fn(),
    devices: vi.fn(async () => [{ deviceId: 'GRACEPHONE', verified: false, own: false }]),
    request: vi.fn(),
    remember: vi.fn((message, content) => {
      results.set(`${message.id}:${message.rev}`, { status: 'ok', content });
    }),
    resultFor: (message) => results.get(`${message.id}:${message.rev}`),
    setResult(message, result) {
      results.set(`${message.id}:${message.rev}`, result);
      for (const listener of listeners) listener();
    },
    reset() {
      results.clear();
      state = { status: 'ready', userId: null, deviceId: 'ABCDEFGHIJ', error: null };
    },
  };
  class E2eeError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  }
  return { e2eeClient: client, E2eeError, roomIdFor: (id) => `!${id}:connect` };
});

configure({ asyncUtilTimeout: 4_000 });

const api = vi.mocked(messagingApi);
const ME = testUser().id;
const PEER = '64b000000000000000000002';
const CONVERSATION = '64b0000000000000000000c1';
const CIPHERTEXT = {
  algorithm: 'm.megolm.v1.aes-sha2',
  ciphertext: 'QUJD',
  device_id: 'ABCDEFGHIJ',
  sender_key: 'K'.repeat(43),
  session_id: 'S'.repeat(43),
};

function conversation(overrides = {}) {
  return {
    id: CONVERSATION,
    type: 'direct',
    peer: {
      id: PEER,
      username: 'grace',
      displayName: 'Grace Hopper',
      avatarUrl: null,
      profileVisibility: 'public',
      presence: { online: true, lastSeenAt: null },
    },
    lastMessage: null,
    lastActivityAt: new Date().toISOString(),
    unreadCount: 0,
    receipts: { lastDeliveredSeq: 0, lastReadSeq: 0 },
    peerReceipts: { lastDeliveredSeq: 0, lastReadSeq: 0 },
    canMessage: true,
    messagingUnavailableReason: null,
    e2ee: { enabledAt: new Date().toISOString() },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function encryptedMessage(seq, senderId = PEER, clientMessageId = undefined) {
  return {
    id: `6500000000000000000000${String(seq).padStart(2, '0')}`,
    conversationId: CONVERSATION,
    seq,
    clientMessageId: clientMessageId ?? `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    senderId,
    type: 'text',
    text: '',
    encryption: 'e2ee_v1',
    encrypted: CIPHERTEXT,
    rev: 0,
    createdAt: new Date().toISOString(),
  };
}

const page = (items) => ({ items, meta: { limit: 30, hasMore: false, nextCursor: null } });

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  resetMessagingStore(null);
  e2eeClient.reset();
  vi.mocked(authApi.getSession).mockResolvedValue(testSession());
  api.listConversations.mockResolvedValue(page([conversation()]));
  api.getConversation.mockResolvedValue(conversation());
  api.listMessages.mockResolvedValue(page([encryptedMessage(1)]));
});

describe('an end-to-end encrypted chat', () => {
  it('shows decrypted text, what is still locked, and the encryption mark', async () => {
    const [first] = (await api.listMessages()).items;
    const second = encryptedMessage(2);
    api.listMessages.mockResolvedValue(page([first, second]));
    e2eeClient.setResult(first, {
      status: 'ok',
      content: { msgtype: 'm.text', body: 'only we can read this', 'connect.message': {} },
    });
    e2eeClient.setResult(second, { status: 'failed', reason: 'mismatched_sender' });
    renderRoute(`/chats/${CONVERSATION}`);
    const log = await screen.findByRole('log');
    expect(await within(log).findByText('only we can read this')).toBeVisible();
    expect(within(log).getByText("Couldn't decrypt this message")).toBeVisible();
    expect(screen.getByRole('img', { name: 'End-to-end encrypted' })).toBeVisible();
    // A device of theirs that isn't verified here (e.g. a new one) is called out.
    expect(await screen.findByText(/has a device you haven’t verified/)).toBeVisible();
    // No stickers in encrypted chats yet.
    expect(screen.queryByRole('button', { name: /sticker/i })).toBeNull();
  });

  it('sends only ciphertext, and retries with exactly the same ciphertext', async () => {
    const user = userEvent.setup();
    e2eeClient.encrypt.mockResolvedValue(CIPHERTEXT);
    api.sendMessage
      .mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'NETWORK_ERROR' }))
      .mockImplementationOnce((_id, { clientMessageId }) =>
        Promise.resolve({ message: encryptedMessage(2, ME, clientMessageId), duplicate: false }),
      );
    renderRoute(`/chats/${CONVERSATION}`);
    await screen.findByRole('log');
    await user.type(screen.getByLabelText('Message'), 'top secret{Enter}');
    const log = screen.getByRole('log');
    await user.click(await within(log).findByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(api.sendMessage).toHaveBeenCalledTimes(2));

    const [first, second] = api.sendMessage.mock.calls.map(([, payload]) => payload);
    expect(first).toEqual({ clientMessageId: expect.any(String), encrypted: CIPHERTEXT });
    expect(second).toEqual(first);
    expect(JSON.stringify(api.sendMessage.mock.calls)).not.toContain('top secret');
    expect(e2eeClient.encrypt).toHaveBeenCalledTimes(1);
    expect(e2eeClient.encrypt.mock.calls[0][1]).toEqual({
      msgtype: 'm.text',
      body: 'top secret',
      'connect.message': { clientMessageId: first.clientMessageId },
    });
    // Your own message shows from what you wrote, without decrypting it again.
    await waitFor(() => expect(e2eeClient.remember).toHaveBeenCalled());
  });

  it('never sends anything when encryption fails', async () => {
    const user = userEvent.setup();
    const { E2eeError } = await import('../../e2ee/e2ee-client');
    e2eeClient.encrypt.mockRejectedValue(
      new E2eeError('E2EE_PEER_NO_DEVICE', 'The other person has no encryption device right now.'),
    );
    renderRoute(`/chats/${CONVERSATION}`);
    await screen.findByRole('log');
    await user.type(screen.getByLabelText('Message'), 'hello{Enter}');
    expect(
      await within(screen.getByRole('log')).findByText(
        'The other person has no encryption device right now.',
      ),
    ).toBeVisible();
    expect(api.sendMessage).not.toHaveBeenCalled();
  });

  it('sends files as before (marked not end-to-end encrypted); the caption follows as an encrypted message', async () => {
    const user = userEvent.setup();
    e2eeClient.encrypt.mockResolvedValue(CIPHERTEXT);
    const uploadedFile = {
      id: '6500000000000000000000aa',
      kind: 'document',
      contentType: 'text/plain',
      name: 'plans.txt',
      size: 13,
      width: null,
      height: null,
      url: '/api/v1/attachments/6500000000000000000000aa/content',
    };
    api.uploadAttachment.mockResolvedValue(uploadedFile);
    let seq = 1;
    api.sendMessage.mockImplementation((_id, payload) => {
      seq += 1;
      const message = payload.attachmentId
        ? {
            ...encryptedMessage(seq, ME, payload.clientMessageId),
            type: 'attachment',
            encryption: 'none',
            encrypted: null,
            attachment: uploadedFile,
          }
        : encryptedMessage(seq, ME, payload.clientMessageId);
      return Promise.resolve({ message, duplicate: false });
    });
    const { container } = renderRoute(`/chats/${CONVERSATION}`);
    await screen.findByRole('log');
    const picked = new File(['meeting notes'], 'plans.txt', { type: 'text/plain' });
    await user.upload(container.querySelector('input[type="file"]'), picked);
    await user.type(screen.getByLabelText('Message'), 'see attached{Enter}');
    await waitFor(() => expect(api.sendMessage).toHaveBeenCalledTimes(2));

    // The file itself, unchanged and without text.
    expect(api.uploadAttachment.mock.calls[0][1]).toBe(picked);
    const [[, filePayload], [, captionPayload]] = api.sendMessage.mock.calls;
    expect(filePayload).toEqual({
      clientMessageId: expect.any(String),
      attachmentId: '6500000000000000000000aa',
    });
    // Then the caption, encrypted.
    expect(captionPayload).toEqual({ clientMessageId: expect.any(String), encrypted: CIPHERTEXT });
    expect(e2eeClient.encrypt.mock.calls[0][1]).toMatchObject({ body: 'see attached' });
    expect(JSON.stringify(api.sendMessage.mock.calls)).not.toContain('see attached');
    expect(await screen.findByText('Not end-to-end encrypted')).toBeVisible();
  });

  it('can’t send until encryption is ready on this browser', async () => {
    e2eeClient.setState({ status: 'off' });
    renderRoute(`/chats/${CONVERSATION}`);
    expect(
      await screen.findByText(
        /This chat is end-to-end encrypted. To send messages, set up encryption/,
      ),
    ).toBeVisible();
    expect(
      within(screen.getByRole('log')).getByText(/Set up encryption on this browser to read it/),
    ).toBeVisible();
  });
});
