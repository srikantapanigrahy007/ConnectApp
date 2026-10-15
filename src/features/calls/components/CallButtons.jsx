import { Phone, Video } from 'lucide-react';
import { IconButton } from '../../../components/ui/Button';
import { startCall, useCallState } from '../call-client';

/**
 * Audio and video call buttons for a one-to-one conversation. `unavailable` (a reason) disables
 * them, e.g. when messaging isn't allowed; the server checks the same rules again.
 */
export function CallButtons({ conversationId, peerName, unavailable }) {
  const busy = useCallState((state) => state.phase !== 'idle' && state.phase !== 'ended');
  const disabled = Boolean(unavailable) || busy;
  const hint = unavailable ?? (busy ? 'You are already in a call' : null);
  return (
    <>
      <IconButton
        icon={Phone}
        label={hint ? `Audio call (${hint})` : `Audio call with ${peerName}`}
        disabled={disabled}
        onClick={() => void startCall(conversationId, 'audio')}
      />
      <IconButton
        icon={Video}
        label={hint ? `Video call (${hint})` : `Video call with ${peerName}`}
        disabled={disabled}
        onClick={() => void startCall(conversationId, 'video')}
      />
    </>
  );
}
