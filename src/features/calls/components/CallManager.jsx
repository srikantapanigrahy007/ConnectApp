import { Phone, PhoneOff, Video } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Alert } from '../../../components/ui/Alert';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { Dialog } from '../../../components/ui/Dialog';
import { useSession } from '../../auth/hooks';
import { useNotificationPreferences } from '../../notifications/hooks';
import { acceptCall, declineCall, startCallsClient, useCallState } from '../call-client';
import { showIncomingCallAlert } from '../desktop-alert';
import { CallScreen } from './CallScreen';

/** The ringing call: who is calling, Accept and Decline (closing the dialog declines). */
function IncomingCallDialog({ call, answering, error }) {
  const video = call.type === 'video';
  return (
    <Dialog
      open
      size="sm"
      onClose={() => void declineCall()}
      title={`Incoming ${video ? 'video' : 'audio'} call`}
      footer={
        <>
          <Button variant="danger" icon={PhoneOff} onClick={() => void declineCall()}>
            Decline
          </Button>
          <Button
            data-autofocus
            icon={video ? Video : Phone}
            loading={answering}
            onClick={() => void acceptCall()}
          >
            Accept
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <Avatar name={call.peer.displayName} src={call.peer.avatarUrl} size="lg" decorative />
        <p className="text-base font-semibold text-ink">{call.peer.displayName}</p>
        <p className="text-sm text-ink-muted" aria-live="polite">
          {answering ? 'Connecting…' : `@${call.peer.username} is calling you`}
        </p>
        {error ? (
          <Alert tone="danger" role="alert" className="w-full text-left">
            {error.message}
          </Alert>
        ) : null}
      </div>
    </Dialog>
  );
}

/**
 * Calls for the signed-in shell: connects the call client to the socket and shows the incoming
 * dialog or the call screen. Only one of them is ever shown (state is keyed by call id).
 */
export function CallManager() {
  const session = useSession();
  const userId = session.user?.id ?? null;
  const { phase, call, error } = useCallState();
  const preferences = useNotificationPreferences().data;
  const alerted = useRef(null);

  useEffect(() => {
    if (!userId) return undefined;
    return startCallsClient();
  }, [userId]);

  // A ringing call in a background tab: one desktop alert per call, if you turned them on.
  useEffect(() => {
    if (phase !== 'incoming' || !call || alerted.current === call.id) return;
    alerted.current = call.id;
    showIncomingCallAlert(call, { enabled: Boolean(preferences?.desktop) });
  }, [phase, call, preferences?.desktop]);

  if (phase === 'idle') return null;
  if ((phase === 'incoming' || phase === 'answering') && call) {
    return <IncomingCallDialog call={call} answering={phase === 'answering'} error={error} />;
  }
  return <CallScreen />;
}
