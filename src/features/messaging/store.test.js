import { beforeEach, describe, expect, it } from 'vitest';
import {
  addToOutbox,
  contiguousSeq,
  getMessagingState,
  mergeMessages,
  outboxOf,
  receiptsOf,
  resetMessagingStore,
  timelineOf,
  updateReceipts,
} from './store';
import { deliveryStatus, toChatMessages } from './view-models';

const ME = '64b000000000000000000001';
const PEER = '64b000000000000000000002';
const CONVERSATION = '64b0000000000000000000c1';

const message = (seq, overrides = {}) => ({
  id: `m${seq}`,
  conversationId: CONVERSATION,
  seq,
  clientMessageId: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
  senderId: PEER,
  text: `message ${seq}`,
  createdAt: new Date(2026, 9, 13, 12, seq).toISOString(),
  ...overrides,
});

beforeEach(() => {
  window.sessionStorage.clear();
  resetMessagingStore(null);
  resetMessagingStore(ME);
});

describe('messaging store', () => {
  it('shows a message once whether it arrives by HTTP, live event or synchronisation', () => {
    mergeMessages(CONVERSATION, [message(1), message(2)]); // history over HTTP
    mergeMessages(CONVERSATION, [message(3)]); // message:created
    mergeMessages(CONVERSATION, [message(2), message(3), message(4)]); // conversation:sync
    mergeMessages(CONVERSATION, [message(3)]); // the same live event again
    expect(timelineOf(CONVERSATION).messages.map((m) => m.seq)).toEqual([1, 2, 3, 4]);
  });

  it('keeps messages ordered by seq, including older pages added later', () => {
    mergeMessages(CONVERSATION, [message(5), message(6)]);
    mergeMessages(CONVERSATION, [message(3), message(4)]);
    expect(timelineOf(CONVERSATION).messages.map((m) => m.seq)).toEqual([3, 4, 5, 6]);
  });

  it('replaces a pending message with the stored one (matched by idempotency key)', () => {
    const clientMessageId = '11111111-1111-4111-8111-111111111111';
    addToOutbox({
      clientMessageId,
      conversationId: CONVERSATION,
      text: 'hi',
      createdAt: new Date().toISOString(),
      status: 'sending',
    });
    const stored = message(1, { senderId: ME, clientMessageId, text: 'hi' });
    mergeMessages(CONVERSATION, [stored]);
    mergeMessages(CONVERSATION, [stored]);

    expect(outboxOf(CONVERSATION)).toEqual([]);
    const items = toChatMessages({
      messages: timelineOf(CONVERSATION).messages,
      outbox: outboxOf(CONVERSATION),
      receipts: receiptsOf(CONVERSATION),
      selfId: ME,
      peer: { id: PEER, displayName: 'Grace' },
      actions: {},
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ key: `${ME}:${clientMessageId}`, status: 'sent' });
  });

  it('does not let another sender’s message settle your pending one', () => {
    const clientMessageId = '22222222-2222-4222-8222-222222222222';
    addToOutbox({
      clientMessageId,
      conversationId: CONVERSATION,
      text: 'mine',
      createdAt: new Date().toISOString(),
      status: 'sending',
    });
    mergeMessages(CONVERSATION, [message(1, { clientMessageId })]); // from PEER
    expect(outboxOf(CONVERSATION)).toHaveLength(1);
  });

  it('finds the highest seq without a gap', () => {
    mergeMessages(CONVERSATION, [message(4), message(5), message(7)]);
    expect(contiguousSeq(timelineOf(CONVERSATION))).toBe(5);
  });

  it('only moves receipt positions forward', () => {
    updateReceipts(CONVERSATION, { peerDeliveredSeq: 5, peerReadSeq: 3 });
    updateReceipts(CONVERSATION, { peerDeliveredSeq: 2, peerReadSeq: 1 });
    expect(receiptsOf(CONVERSATION)).toMatchObject({ peerDeliveredSeq: 5, peerReadSeq: 3 });
    updateReceipts(CONVERSATION, { peerReadSeq: null });
    expect(receiptsOf(CONVERSATION).peerReadSeq).toBeNull();
  });

  it('forgets everything when another user signs in', () => {
    mergeMessages(CONVERSATION, [message(1)]);
    resetMessagingStore('64b0000000000000000000ff');
    expect(getMessagingState().timelines).toEqual({});
  });
});

describe('delivery status', () => {
  it('is sent, delivered or read from the other person’s positions', () => {
    const receipts = { peerDeliveredSeq: 4, peerReadSeq: 2 };
    expect(deliveryStatus(2, receipts)).toBe('read');
    expect(deliveryStatus(3, receipts)).toBe('delivered');
    expect(deliveryStatus(5, receipts)).toBe('sent');
    // Read receipts turned off: never "read".
    expect(deliveryStatus(1, { peerDeliveredSeq: 4, peerReadSeq: null })).toBe('delivered');
  });
});
