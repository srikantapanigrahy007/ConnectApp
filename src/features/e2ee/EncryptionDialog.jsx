import { useQueryClient } from '@tanstack/react-query';
import { Lock, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { cryptoRuntime } from './crypto-runtime';
import { e2eeClient } from './e2ee-client';
import * as api from './api';
import { conversationE2eeKey, useConversationE2eeStatus, useE2eeState } from './hooks';
import { VerificationPanel } from './VerificationPanel';

const STATE_TEXT = {
  unavailable:
    "End-to-end encryption can't run in this browser, or it's already open in another tab.",
  failed: "Encryption couldn't start on this browser.",
  starting: 'Setting up encryption on this browser…',
};

const REASON_TEXT = {
  disabled: 'End-to-end encryption is not available on this server yet.',
  not_direct: 'Only one-to-one chats can be end-to-end encrypted.',
  not_allowed: "You can't message this person right now.",
  no_device: 'Set up encryption on this browser first.',
  peer_no_device: (name) => `${name} hasn't set up end-to-end encryption yet.`,
};

/**
 * A conversation's end-to-end encryption: what it means, setting it up on this browser, and
 * switching the chat to it (for both people, no way back). Opt-in only; nothing happens without
 * an explicit click here.
 */
export function EncryptionDialog({ open, onClose, conversation, selfId, onChanged }) {
  const queryClient = useQueryClient();
  const e2ee = useE2eeState();
  const status = useConversationE2eeStatus(conversation.id, open && !conversation.e2ee);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const peerName = conversation.peer?.displayName ?? 'The other person';

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: conversationE2eeKey(conversation.id) });

  const run = async (name, task) => {
    setBusy(name);
    setError(null);
    try {
      await task();
    } catch (failure) {
      setError(failure?.message ?? 'Something went wrong. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const setUp = () =>
    run('setup', async () => {
      const result = await e2eeClient.start(selfId, { setUp: true });
      if (result.status !== 'ready')
        throw new Error(STATE_TEXT[result.status] ?? STATE_TEXT.failed);
      await refresh();
    });

  // The server no longer knows this browser's device: start over with a new one.
  const reset = () =>
    run('reset', async () => {
      e2eeClient.stop();
      const forgotten = await cryptoRuntime.forgetDevice(selfId);
      if (!forgotten.forgotten) throw new Error(STATE_TEXT.unavailable);
      const result = await e2eeClient.start(selfId, { setUp: true });
      if (result.status !== 'ready')
        throw new Error(STATE_TEXT[result.status] ?? STATE_TEXT.failed);
      await refresh();
    });

  const enable = () =>
    run('enable', async () => {
      await api.enableConversation(conversation.id);
      await refresh();
      onChanged?.();
    });

  const reason = status.data?.reason;
  const reasonText =
    typeof REASON_TEXT[reason] === 'function' ? REASON_TEXT[reason](peerName) : REASON_TEXT[reason];
  const needsSetup = e2ee.status !== 'ready' && (conversation.e2ee || reason === 'no_device');

  let footer = (
    <Button variant="secondary" onClick={onClose}>
      Close
    </Button>
  );
  if (needsSetup && e2ee.status !== 'unavailable') {
    footer = (
      <>
        <Button variant="secondary" onClick={onClose}>
          Not now
        </Button>
        {e2ee.error === 'E2EE_DEVICE_REMOVED' ? (
          <Button loading={busy === 'reset'} onClick={() => void reset()}>
            Reset encryption on this browser
          </Button>
        ) : (
          <Button
            loading={busy === 'setup' || e2ee.status === 'starting'}
            onClick={() => void setUp()}
          >
            Set up on this browser
          </Button>
        )}
      </>
    );
  } else if (!conversation.e2ee && status.data?.canEnable) {
    footer = (
      <>
        <Button variant="secondary" onClick={onClose}>
          Not now
        </Button>
        <Button icon={Lock} loading={busy === 'enable'} onClick={() => void enable()}>
          Turn on encryption
        </Button>
      </>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="End-to-end encryption"
      description={
        conversation.e2ee
          ? 'New text messages in this chat are encrypted on your devices. Connect’s servers can’t read them.'
          : `Encrypt new text messages with ${peerName} on your devices, so Connect’s servers can’t read them.`
      }
      footer={footer}
    >
      <div className="space-y-3 text-sm text-ink">
        {!conversation.e2ee ? (
          <ul className="list-disc space-y-1 pl-5 text-ink-muted">
            <li>It applies to both of you and can’t be turned off again.</li>
            <li>Earlier messages stay unencrypted.</li>
            <li>
              Only your devices with encryption set up can read new messages. If you lose them all,
              those messages can’t be recovered.
            </li>
            <li>
              Only text is end-to-end encrypted. Photos, videos, audio, voice messages and files are
              not, and are labelled “Not end-to-end encrypted”. A caption goes as a separate,
              encrypted message. Stickers, polls and forwarding aren’t available in encrypted chats
              yet. Calls are not end-to-end encrypted.
            </li>
          </ul>
        ) : null}
        {conversation.e2ee && e2ee.status === 'ready' && conversation.peer ? (
          <VerificationPanel peerId={conversation.peer.id} peerName={peerName} />
        ) : (
          <Alert tone="warning" icon={ShieldAlert}>
            Until you verify {peerName}’s devices (compare emoji, once encryption is on), you can’t
            be sure a device really belongs to them.
          </Alert>
        )}
        {e2ee.status !== 'ready' && STATE_TEXT[e2ee.status] ? (
          <Alert tone={e2ee.status === 'starting' ? 'info' : 'danger'} role="status">
            {e2ee.error === 'E2EE_DEVICE_REMOVED'
              ? 'This browser’s encryption device was removed. Reset encryption here to continue (messages it could read before can’t be read again).'
              : STATE_TEXT[e2ee.status]}
          </Alert>
        ) : null}
        {!conversation.e2ee && reasonText && reason !== 'no_device' ? (
          <Alert tone="info" role="status">
            {reasonText}
          </Alert>
        ) : null}
        {error ? (
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        ) : null}
      </div>
    </Dialog>
  );
}
