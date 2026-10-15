/**
 * Test-only page for e2ee-messaging.e2e.test.js. It drives the app's real end-to-end encryption
 * client (real library, IndexedDB device, real API through the Vite proxy) and the app's real
 * messaging API calls. It returns decrypted text to the test driver only to compare it.
 */
import * as e2eeApi from '../src/features/e2ee/api';
import { e2eeClient } from '../src/features/e2ee/e2ee-client';
import * as messagingApi from '../src/features/messaging/api';

async function resultOf(message) {
  e2eeClient.request(message);
  for (let i = 0; i < 200; i++) {
    const result = e2eeClient.resultFor(message);
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return { status: 'timeout' };
}

window.harness = {
  async start(userId, setUp = false) {
    const state = await e2eeClient.start(userId, { setUp });
    return { status: state.status, error: state.error, deviceId: state.deviceId };
  },
  enable: (conversationId) => e2eeApi.enableConversation(conversationId),
  conversation: (conversationId) => messagingApi.getConversation(conversationId),
  async sendText(conversationId, text) {
    const conversation = await messagingApi.getConversation(conversationId);
    const clientMessageId = crypto.randomUUID();
    const encrypted = await e2eeClient.encrypt(conversation, {
      msgtype: 'm.text',
      body: text,
      'connect.message': { clientMessageId },
    });
    const sent = await messagingApi.sendMessage(conversationId, { clientMessageId, encrypted });
    return sent.message.id;
  },
  async sendPlain(conversationId, text) {
    try {
      await messagingApi.sendMessage(conversationId, {
        clientMessageId: crypto.randomUUID(),
        text,
      });
      return 'sent';
    } catch (error) {
      return error.code;
    }
  },
  sync: () => e2eeClient.syncNow(),
  devices: (userId) => e2eeClient.devices(userId),
  requestVerification: (userId, deviceId) => e2eeClient.requestVerification(userId, deviceId),
  incoming: (userId) => e2eeClient.incomingVerifications(userId),
  async step(userId, flowId, accept) {
    await e2eeClient.syncNow();
    return e2eeClient.verificationStep(userId, flowId, { accept });
  },
  confirm: (userId, flowId) => e2eeClient.confirmVerification(userId, flowId),
  async readVerified(conversationId) {
    const page = await messagingApi.listMessages(conversationId, { limit: 30 });
    const message = page.items.filter((item) => item.encryption === 'e2ee_v1').at(-1);
    e2eeClient.request(message);
    for (let i = 0; i < 200 && !e2eeClient.resultFor(message); i++) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return e2eeClient.resultFor(message);
  },
  /** A file in an encrypted chat: sent as before (not end-to-end encrypted), without text. */
  async sendPlainFile(conversationId, name, type, text) {
    const uploaded = await messagingApi.uploadAttachment(
      conversationId,
      new File([text], name, { type }),
    );
    const sent = await messagingApi.sendMessage(conversationId, {
      clientMessageId: crypto.randomUUID(),
      attachmentId: uploaded.id,
    });
    return sent.message.id;
  },
  async read(conversationId) {
    const page = await messagingApi.listMessages(conversationId, { limit: 30 });
    const out = [];
    for (const message of page.items) {
      if (message.encryption !== 'e2ee_v1') {
        out.push({ type: message.type, text: message.text, encrypted: false });
        continue;
      }
      const result = await resultOf(message);
      out.push({
        type: message.type,
        encrypted: true,
        status: result.status,
        reason: result.reason ?? null,
        text: result.status === 'ok' ? result.content.body : null,
      });
    }
    return out;
  },
};
document.getElementById('status').textContent = 'ready';
