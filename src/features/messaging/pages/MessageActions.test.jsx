import { configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../lib/api-client';
import { testSession, testUser } from '../../../test/auth-fixtures';
import { renderRoute } from '../../../test/render';
import * as authApi from '../../auth/api';
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
  deleteMessage: vi.fn(),
  react: vi.fn(),
  unreact: vi.fn(),
  setPinned: vi.fn(),
  setStarred: vi.fn(),
  listStarred: vi.fn(),
  uploadAttachment: vi.fn(),
}));

configure({ asyncUtilTimeout: 4_000 });

const api = vi.mocked(messagingApi);
const ME = testUser().id;
const PEER = '64b000000000000000000002';
const CONVERSATION = '64b0000000000000000000c1';

const conversation = (overrides = {}) => ({
  id: CONVERSATION,
  type: 'direct',
  peer: {
    id: PEER,
    username: 'grace',
    displayName: 'Grace Hopper',
    avatarUrl: null,
    profileVisibility: 'public',
    presence: { online: false, lastSeenAt: null },
  },
  lastMessage: null,
  lastActivityAt: new Date().toISOString(),
  unreadCount: 0,
  receipts: { lastDeliveredSeq: 0, lastReadSeq: 0 },
  peerReceipts: { lastDeliveredSeq: 0, lastReadSeq: 0 },
  pins: [],
  rules: { editWindowSeconds: 900, deleteWindowSeconds: 3600, pinLimit: 3 },
  canMessage: true,
  messagingUnavailableReason: null,
  createdAt: new Date().toISOString(),
  ...overrides,
});

const message = (seq, overrides = {}) => ({
  id: `6500000000000000000000${String(seq).padStart(2, '0')}`,
  conversationId: CONVERSATION,
  seq,
  clientMessageId: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
  senderId: PEER,
  type: 'text',
  text: `message ${seq}`,
  attachment: null,
  sticker: null,
  replyTo: null,
  forwarded: false,
  editedAt: null,
  deletedAt: null,
  reactions: [],
  rev: 0,
  createdAt: new Date().toISOString(),
  starred: false,
  hidden: false,
  ...overrides,
});
const page = (items) => ({ items, meta: { limit: 30, hasMore: false, nextCursor: null } });

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  resetMessagingStore(null);
  vi.mocked(authApi.getSession).mockResolvedValue(testSession());
  api.listConversations.mockResolvedValue(page([conversation()]));
  api.getConversation.mockResolvedValue(conversation());
});

async function openMenu(user, log, text) {
  const row = within(log).getByText(text).closest('[data-message-id]');
  await user.click(within(row).getByRole('button', { name: 'Message actions' }));
  return row;
}

describe('attachments in the UI', () => {
  it('shows upload progress, a failure with its reason, and retries without losing the file', async () => {
    const user = userEvent.setup();
    api.listMessages.mockResolvedValue(page([message(1, { text: 'hi' })]));
    let rejectUpload;
    api.uploadAttachment
      .mockImplementationOnce((_id, _file, { onProgress }) => {
        onProgress(0.5);
        return new Promise((_resolve, reject) => {
          rejectUpload = reject;
        });
      })
      .mockResolvedValueOnce({
        id: '6600000000000000000000aa',
        kind: 'document',
        contentType: 'application/pdf',
        name: 'report.pdf',
        size: 12,
        width: null,
        height: null,
        url: '/api/v1/attachments/6600000000000000000000aa/content',
      });
    api.sendMessage.mockImplementation((_cid, payload) =>
      Promise.resolve({
        message: message(2, {
          senderId: ME,
          clientMessageId: payload.clientMessageId,
          type: 'attachment',
          text: '',
          attachment: {
            id: payload.attachmentId,
            kind: 'document',
            contentType: 'application/pdf',
            name: 'report.pdf',
            size: 12,
            width: null,
            height: null,
            url: `/api/v1/attachments/${payload.attachmentId}/content`,
          },
        }),
        duplicate: false,
      }),
    );
    const { container } = renderRoute(`/chats/${CONVERSATION}`);
    await screen.findByText('hi');

    const file = new File(['%PDF-1.4'], 'report.pdf', { type: 'application/pdf' });
    await user.upload(container.querySelector('input[type="file"]'), file);
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    const log = screen.getByRole('log');
    const progress = await within(log).findByRole('progressbar', { name: 'Upload progress' });
    expect(progress).toHaveAttribute('aria-valuenow', '50');
    // Never shown as sent while uploading.
    expect(within(log).queryByText('Sent')).toBeNull();

    rejectUpload(
      new ApiError('SERVICE_UNAVAILABLE', "The file couldn't be stored. Try again.", 503),
    );
    expect(await within(log).findByText("The file couldn't be stored. Try again.")).toBeVisible();
    expect(within(log).getByText('report.pdf')).toBeInTheDocument();
    expect(api.sendMessage).not.toHaveBeenCalled();

    await user.click(within(log).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(within(log).getByText('Sent')).toBeInTheDocument());
    expect(api.uploadAttachment).toHaveBeenCalledTimes(2);
    expect(api.uploadAttachment.mock.calls[1][1]).toBe(file);
    expect(api.sendMessage).toHaveBeenCalledTimes(1);
    expect(api.sendMessage.mock.calls[0][1]).toMatchObject({
      attachmentId: '6600000000000000000000aa',
    });
    expect(within(log).getAllByText('report.pdf')).toHaveLength(1);
  });

  it('a failed send after a successful upload retries without uploading again', async () => {
    const user = userEvent.setup();
    api.listMessages.mockResolvedValue(page([]));
    api.uploadAttachment.mockResolvedValue({
      id: '6600000000000000000000bb',
      kind: 'document',
      contentType: 'text/plain',
      name: 'notes.txt',
      size: 5,
      width: null,
      height: null,
      url: '/api/v1/attachments/6600000000000000000000bb/content',
    });
    api.sendMessage
      .mockRejectedValueOnce(new ApiError('NETWORK_ERROR', 'Unable to reach the server.'))
      .mockImplementationOnce((_cid, payload) =>
        Promise.resolve({
          message: message(1, {
            senderId: ME,
            clientMessageId: payload.clientMessageId,
            text: 'caption',
          }),
          duplicate: false,
        }),
      );
    const { container } = renderRoute(`/chats/${CONVERSATION}`);
    await screen.findByText('No messages yet');
    await user.upload(
      container.querySelector('input[type="file"]'),
      new File(['notes'], 'notes.txt', { type: 'text/plain' }),
    );
    await user.type(screen.getByLabelText('Message'), 'caption{Enter}');
    const log = await screen.findByRole('log');
    await user.click(await within(log).findByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(api.sendMessage).toHaveBeenCalledTimes(2));
    expect(api.uploadAttachment).toHaveBeenCalledTimes(1);
    const [first, second] = api.sendMessage.mock.calls;
    expect(second[1]).toEqual(first[1]);
    expect(first[1]).toMatchObject({ text: 'caption', attachmentId: '6600000000000000000000bb' });
  });

  it('refuses files over 5 MB and unsupported types before uploading', async () => {
    const user = userEvent.setup({ applyAccept: false });
    api.listMessages.mockResolvedValue(page([]));
    const { container } = renderRoute(`/chats/${CONVERSATION}`);
    await screen.findByText('No messages yet');
    const input = container.querySelector('input[type="file"]');
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' });
    await user.upload(input, big);
    expect(await screen.findByRole('alert')).toHaveTextContent('larger than 5 MB');
    await user.upload(input, new File(['x'], 'run.exe', { type: 'application/x-msdownload' }));
    expect(screen.getByRole('alert')).toHaveTextContent("isn't a supported file type");
    expect(api.uploadAttachment).not.toHaveBeenCalled();
  });

  it('sends a sticker from the catalog', async () => {
    const user = userEvent.setup();
    api.listMessages.mockResolvedValue(page([]));
    api.sendMessage.mockReturnValue(new Promise(() => undefined));
    renderRoute(`/chats/${CONVERSATION}`);
    await screen.findByText('No messages yet');
    await user.click(screen.getByRole('button', { name: 'Stickers' }));
    await user.click(screen.getByRole('button', { name: 'Send sticker: Waving hand' }));
    await waitFor(() =>
      expect(api.sendMessage).toHaveBeenCalledWith(
        CONVERSATION,
        expect.objectContaining({ sticker: 'wave' }),
      ),
    );
  });
});

describe('message actions in the UI', () => {
  it('replies with a quote of the original', async () => {
    const user = userEvent.setup();
    api.listMessages.mockResolvedValue(page([message(1, { text: 'Lunch at noon?' })]));
    api.sendMessage.mockReturnValue(new Promise(() => undefined));
    renderRoute(`/chats/${CONVERSATION}`);
    const log = await screen.findByRole('log');
    await within(log).findByText('Lunch at noon?');
    await openMenu(user, log, 'Lunch at noon?');
    await user.click(screen.getByRole('menuitem', { name: 'Reply' }));
    expect(screen.getByText('Replying to Grace Hopper')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Message'), 'Yes!{Enter}');
    expect(api.sendMessage).toHaveBeenCalledWith(
      CONVERSATION,
      expect.objectContaining({ text: 'Yes!', replyToId: message(1).id }),
    );
    expect(screen.queryByText('Replying to Grace Hopper')).toBeNull();
  });

  it('edits your own message and shows it as edited', async () => {
    const user = userEvent.setup();
    const mine = message(1, { senderId: ME, text: 'helo' });
    api.listMessages.mockResolvedValue(page([mine]));
    api.editMessage.mockResolvedValue({
      ...mine,
      text: 'hello',
      editedAt: new Date().toISOString(),
      rev: 1,
    });
    renderRoute(`/chats/${CONVERSATION}`);
    const log = await screen.findByRole('log');
    await within(log).findByText('helo');
    await openMenu(user, log, 'helo');
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const box = screen.getByLabelText('Edit message');
    expect(box).toHaveValue('helo');
    await user.clear(box);
    await user.type(box, 'hello{Enter}');
    expect(api.editMessage).toHaveBeenCalledWith(CONVERSATION, mine.id, 'hello');
    expect(await within(log).findByText('hello')).toBeInTheDocument();
    expect(within(log).getByText('· Edited')).toBeInTheDocument();
  });

  it('does not offer Edit for other people’s messages', async () => {
    const user = userEvent.setup();
    api.listMessages.mockResolvedValue(page([message(1, { text: 'theirs' })]));
    renderRoute(`/chats/${CONVERSATION}`);
    const log = await screen.findByRole('log');
    await within(log).findByText('theirs');
    await openMenu(user, log, 'theirs');
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Copy text' })).toBeInTheDocument();
  });

  it('confirms delete for everyone and shows the tombstone', async () => {
    const user = userEvent.setup();
    const mine = message(1, { senderId: ME, text: 'oops' });
    api.listMessages.mockResolvedValue(page([mine]));
    api.deleteMessage.mockResolvedValue({
      message: { ...mine, text: '', deletedAt: new Date().toISOString(), rev: 1 },
    });
    renderRoute(`/chats/${CONVERSATION}`);
    const log = await screen.findByRole('log');
    await within(log).findByText('oops');
    await openMenu(user, log, 'oops');
    await user.click(screen.getByRole('menuitem', { name: 'Delete…' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete message?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete for everyone' }));
    expect(api.deleteMessage).toHaveBeenCalledWith(CONVERSATION, mine.id, 'everyone');
    expect(await within(log).findByText('This message was deleted')).toBeInTheDocument();
  });

  it('delete for me hides the message only here', async () => {
    const user = userEvent.setup();
    const theirs = message(1, { text: 'bye' });
    api.listMessages.mockResolvedValue(page([theirs]));
    api.deleteMessage.mockResolvedValue({
      state: { conversationId: CONVERSATION, messageId: theirs.id, starred: false, hidden: true },
    });
    renderRoute(`/chats/${CONVERSATION}`);
    const log = await screen.findByRole('log');
    await within(log).findByText('bye');
    await openMenu(user, log, 'bye');
    await user.click(screen.getByRole('menuitem', { name: 'Delete…' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete message?' });
    expect(within(dialog).queryByRole('button', { name: 'Delete for everyone' })).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Delete for me' }));
    await waitFor(() => expect(screen.queryByText('bye')).toBeNull());
    expect(api.deleteMessage).toHaveBeenCalledWith(CONVERSATION, theirs.id, 'me');
  });

  it('reacts with the fixed emoji set and shows counts', async () => {
    const user = userEvent.setup();
    const theirs = message(1, { text: 'nice' });
    api.listMessages.mockResolvedValue(page([theirs]));
    api.react.mockResolvedValue({ ...theirs, rev: 1, reactions: [{ userId: ME, emoji: '👍' }] });
    renderRoute(`/chats/${CONVERSATION}`);
    const log = await screen.findByRole('log');
    const row = (await within(log).findByText('nice')).closest('[data-message-id]');
    await user.click(within(row).getByRole('button', { name: 'Add reaction' }));
    await user.click(within(row).getByRole('button', { name: 'React with 👍' }));
    expect(api.react).toHaveBeenCalledWith(CONVERSATION, theirs.id, '👍');
    expect(await within(row).findByRole('button', { name: /👍 1, including you/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('shows a refused action’s reason from the server', async () => {
    const user = userEvent.setup();
    const theirs = message(1, { text: 'pin me' });
    api.listMessages.mockResolvedValue(page([theirs]));
    api.setPinned.mockRejectedValue(
      new ApiError('PIN_LIMIT_REACHED', 'You can pin up to 3 messages. Unpin one first.', 409),
    );
    renderRoute(`/chats/${CONVERSATION}`);
    const log = await screen.findByRole('log');
    await within(log).findByText('pin me');
    await openMenu(user, log, 'pin me');
    await user.click(screen.getByRole('menuitem', { name: 'Pin' }));
    expect(
      await screen.findByText('You can pin up to 3 messages. Unpin one first.'),
    ).toBeInTheDocument();
  });

  it('renders pinned messages and attachment names as text', async () => {
    api.getConversation.mockResolvedValue(
      conversation({
        pins: [
          {
            messageId: message(1).id,
            seq: 1,
            senderId: PEER,
            preview: '<img src=x onerror=alert(1)>',
            pinnedBy: PEER,
            pinnedAt: new Date().toISOString(),
          },
        ],
      }),
    );
    api.listMessages.mockResolvedValue(
      page([
        message(1, {
          type: 'attachment',
          text: '',
          attachment: {
            id: 'a1',
            kind: 'document',
            contentType: 'application/pdf',
            name: '<b>evil</b>.pdf',
            size: 2048,
            width: null,
            height: null,
            url: '/api/v1/attachments/a1/content',
          },
        }),
      ]),
    );
    renderRoute(`/chats/${CONVERSATION}`);
    const pinned = await screen.findByRole('region', { name: 'Pinned messages' });
    expect(within(pinned).getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(pinned.querySelector('img')).toBeNull();
    const log = await screen.findByRole('log');
    expect(within(log).getByText('<b>evil</b>.pdf')).toBeInTheDocument();
    expect(within(log).getByRole('link', { name: 'Download <b>evil</b>.pdf' })).toHaveAttribute(
      'href',
      '/api/v1/attachments/a1/content?download=1',
    );
  });
});
