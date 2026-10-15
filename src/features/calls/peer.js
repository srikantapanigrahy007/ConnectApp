/**
 * One RTCPeerConnection for a call, using the "perfect negotiation" pattern so either side can
 * renegotiate (turning a camera on mid-call) without signaling glare:
 * - the callee is "polite": on an offer collision it rolls back and accepts the other offer;
 * - the caller is "impolite": it ignores the colliding offer and keeps its own.
 *
 * The callee doesn't negotiate until the caller's first offer arrives, and only then adds its
 * tracks, so they reuse the transceivers that offer created (no extra round trip).
 *
 * @param {{ iceServers: RTCIceServer[], polite: boolean, localStream: MediaStream, sendSignal: (signal: object) => void, onRemoteStream: (stream: MediaStream) => void, onConnectionState: (state: string) => void, onError?: (error: unknown) => void }} options
 */
export function createPeer({
  iceServers,
  polite,
  localStream,
  sendSignal,
  onRemoteStream,
  onConnectionState,
  onError = () => undefined,
}) {
  const pc = new RTCPeerConnection({ iceServers });
  const remoteStream = new MediaStream();
  let makingOffer = false;
  let ignoreOffer = false;
  let negotiating = !polite;
  let tracksAdded = false;
  let closed = false;
  /** Candidates that arrived before the remote description. */
  const pendingCandidates = [];

  function addLocalTracks() {
    if (tracksAdded) return;
    tracksAdded = true;
    for (const track of localStream.getTracks()) pc.addTrack(track, localStream);
  }

  pc.onnegotiationneeded = async () => {
    if (!negotiating || closed) return;
    try {
      makingOffer = true;
      await pc.setLocalDescription();
      sendSignal({
        kind: 'description',
        description: { type: pc.localDescription.type, sdp: pc.localDescription.sdp },
      });
    } catch (error) {
      onError(error);
    } finally {
      makingOffer = false;
    }
  };

  pc.onicecandidate = ({ candidate }) => {
    if (closed) return;
    sendSignal({
      kind: 'candidate',
      candidate: candidate
        ? {
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid ?? null,
            sdpMLineIndex: candidate.sdpMLineIndex ?? null,
            usernameFragment: candidate.usernameFragment ?? null,
          }
        : null,
    });
  };

  pc.ontrack = ({ track }) => {
    if (!remoteStream.getTracks().includes(track)) remoteStream.addTrack(track);
    track.onended = () => remoteStream.removeTrack(track);
    onRemoteStream(remoteStream);
  };

  pc.onconnectionstatechange = () => {
    if (!closed) onConnectionState(pc.connectionState);
  };

  async function addCandidate(candidate) {
    try {
      await pc.addIceCandidate(candidate ?? undefined);
    } catch (error) {
      if (!ignoreOffer) throw error;
    }
  }

  // The caller starts negotiating as soon as its tracks are added.
  if (!polite) addLocalTracks();

  return {
    pc,
    remoteStream,

    /** Applies a signal relayed from the other device. */
    async handleSignal(signal) {
      if (closed) return;
      try {
        if (signal.kind === 'description') {
          const { description } = signal;
          const collision =
            description.type === 'offer' && (makingOffer || pc.signalingState !== 'stable');
          ignoreOffer = !polite && collision;
          if (ignoreOffer) return;
          await pc.setRemoteDescription(description);
          for (const candidate of pendingCandidates.splice(0)) await addCandidate(candidate);
          if (description.type === 'offer') {
            addLocalTracks();
            await pc.setLocalDescription();
            negotiating = true;
            sendSignal({
              kind: 'description',
              description: { type: pc.localDescription.type, sdp: pc.localDescription.sdp },
            });
          }
        } else if (!pc.remoteDescription) {
          pendingCandidates.push(signal.candidate);
        } else {
          await addCandidate(signal.candidate);
        }
      } catch (error) {
        onError(error);
      }
    },

    /** Replaces the outgoing track of a kind (switching devices), or adds it (camera on). */
    async setTrack(kind, track) {
      const sender = pc.getSenders().find((candidate) => candidate.track?.kind === kind);
      if (sender) {
        await sender.replaceTrack(track);
        return;
      }
      const unused = pc
        .getTransceivers()
        .find(
          (transceiver) => transceiver.receiver.track?.kind === kind && !transceiver.sender.track,
        );
      if (unused) {
        await unused.sender.replaceTrack(track);
        unused.direction = 'sendrecv';
      } else {
        pc.addTrack(track, localStream);
      }
    },

    /** Gathers new ICE candidates (after a network change); renegotiates through onnegotiationneeded. */
    restartIce() {
      if (closed) return;
      negotiating = true;
      pc.restartIce();
    },

    close() {
      if (closed) return;
      closed = true;
      pc.onnegotiationneeded = null;
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.close();
    },
  };
}
