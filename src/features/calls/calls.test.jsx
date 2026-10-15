import { CALL_SOCKET_EVENTS as EVENTS } from '#shared';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setRealtimeSocket } from '../../lib/realtime-socket';
import { renderWithProviders } from '../../test/render';
import {
  acceptCall,
  declineCall,
  dismissCall,
  getCallState,
  hangUp,
  startCall,
  startCallsClient,
  toggleCamera,
  toggleMicrophone,
} from './call-client';
import { CallButtons } from './components/CallButtons';
import { CallManager } from './components/CallManager';
import { callLogText, formatCallDuration } from './format';

vi.mock('./api', () => ({
  getIceServers: vi.fn(async () => ({
    iceServers: [{ urls: ['stun:stun.example.com'] }],
    ttlSeconds: null,
  })),
}));
vi.mock('../auth/hooks', async (importOriginal) => ({
  ...(await importOriginal()),
  useSession: () => ({ status: 'authenticated', user: { id: 'me' } }),
}));

// ── Browser fakes ──────────────────────────────────────────────────────────

class FakeTrack {
  constructor(kind) {
    this.kind = kind;
    this.enabled = true;
    this.readyState = 'live';
    this.stop = vi.fn(() => {
      this.readyState = 'ended';
    });
  }
}

class FakeStream {
  constructor(tracks = []) {
    this.tracks = [...tracks];
  }
  getTracks() {
    return [...this.tracks];
  }
  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === 'audio');
  }
  getVideoTracks() {
    return this.tracks.filter((track) => track.kind === 'video');
  }
  addTrack(track) {
    this.tracks.push(track);
  }
  removeTrack(track) {
    this.tracks = this.tracks.filter((candidate) => candidate !== track);
  }
}

const peers = [];
class FakePeerConnection {
  constructor(config) {
    this.config = config;
    this.signalingState = 'stable';
    this.connectionState = 'new';
    this.localDescription = null;
    this.remoteDescription = null;
    this.senders = [];
    this.restartIce = vi.fn(() => queueMicrotask(() => this.onnegotiationneeded?.()));
    this.close = vi.fn(() => {
      this.connectionState = 'closed';
    });
    this.addIceCandidate = vi.fn(async () => undefined);
    peers.push(this);
  }
  addTrack(track) {
    this.senders.push({ track, replaceTrack: vi.fn(async () => undefined) });
    queueMicrotask(() => this.onnegotiationneeded?.());
  }
  getSenders() {
    return this.senders;
  }
  getTransceivers() {
    return [];
  }
  async setLocalDescription() {
    const type =
      this.remoteDescription?.type === 'offer' && this.signalingState === 'have-remote-offer'
        ? 'answer'
        : 'offer';
    this.localDescription = { type, sdp: `${type}-sdp` };
    this.signalingState = type === 'offer' ? 'have-local-offer' : 'stable';
  }
  async setRemoteDescription(description) {
    this.remoteDescription = description;
    this.signalingState = description.type === 'offer' ? 'have-remote-offer' : 'stable';
  }
  /** Test helper: the browser reports a new connection state. */
  setConnection(state) {
    this.connectionState = state;
    this.onconnectionstatechange?.();
  }
}

function fakeSocket(responses = {}) {
  const handlers = new Map();
  const emitted = [];
  return {
    connected: true,
    emitted,
    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(handler);
    },
    off(event, handler) {
      handlers.get(event)?.delete(handler);
    },
    listenerCount: (event) => handlers.get(event)?.size ?? 0,
    timeout() {
      return {
        emit(event, payload, callback) {
          emitted.push({ event, payload });
          const respond = responses[event];
          Promise.resolve(respond ? respond(payload) : { ok: true, data: null }).then((response) =>
            callback(null, response),
          );
        },
      };
    },
    fire(event, payload) {
      for (const handler of handlers.get(event) ?? []) handler(payload);
    },
  };
}

const peerCard = {
  id: 'peer',
  username: 'grace',
  displayName: 'Grace Hopper',
  avatarUrl: null,
  profileVisibility: 'public',
};
const call = (overrides = {}) => ({
  id: '64b0000000000000000000c1',
  conversationId: '64b0000000000000000000d1',
  type: 'audio',
  status: 'ringing',
  direction: 'outgoing',
  callerId: 'me',
  calleeId: 'peer',
  peer: peerCard,
  createdAt: '2026-10-14T10:00:00.000Z',
  ringsUntil: '2026-10-14T10:00:45.000Z',
  answeredAt: null,
  endedAt: null,
  durationSeconds: null,
  endReason: null,
  ...overrides,
});

let socket;
let stopClient;
let getUserMedia;
let mediaStreams;

const emittedOf = (event) => socket.emitted.filter((entry) => entry.event === event);
const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

beforeEach(() => {
  peers.length = 0;
  mediaStreams = [];
  globalThis.MediaStream = FakeStream;
  window.RTCPeerConnection = FakePeerConnection;
  getUserMedia = vi.fn(async (constraints) => {
    const stream = new FakeStream([
      new FakeTrack('audio'),
      ...(constraints.video ? [new FakeTrack('video')] : []),
    ]);
    mediaStreams.push(stream);
    return stream;
  });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia, enumerateDevices: vi.fn(async () => []) },
  });
  socket = fakeSocket({
    [EVENTS.start]: () => ({ ok: true, data: { call: call(), duplicate: false } }),
    [EVENTS.accept]: () => ({
      ok: true,
      data: {
        call: call({
          status: 'ongoing',
          direction: 'incoming',
          answeredAt: new Date().toISOString(),
        }),
      },
    }),
    [EVENTS.end]: () => ({
      ok: true,
      data: { call: call({ status: 'completed', durationSeconds: 5, endReason: 'hangup' }) },
    }),
    [EVENTS.active]: () => ({ ok: true, data: { call: null } }),
  });
  stopClient = startCallsClient();
  setRealtimeSocket(socket);
});

afterEach(() => {
  stopClient();
  setRealtimeSocket(null);
  delete window.RTCPeerConnection;
});

const allTracks = () => mediaStreams.flatMap((stream) => stream.getTracks());

describe('outgoing calls', () => {
  it('asks for the microphone first, rings, connects and releases everything on hang-up', async () => {
    await act(() => startCall('64b0000000000000000000d1', 'audio'));
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
    expect(emittedOf(EVENTS.start)[0].payload).toMatchObject({
      conversationId: '64b0000000000000000000d1',
      type: 'audio',
    });
    expect(getCallState().phase).toBe('outgoing');
    expect(peers).toHaveLength(0); // no signaling before the callee answers

    // Repeated events don't create a second peer.
    const answered = call({ status: 'ongoing', answeredAt: new Date().toISOString() });
    act(() => socket.fire(EVENTS.updated, { call: answered }));
    act(() => socket.fire(EVENTS.updated, { call: answered }));
    await flush();
    expect(peers).toHaveLength(1);
    expect(peers[0].config.iceServers).toEqual([{ urls: ['stun:stun.example.com'] }]);
    expect(getCallState().phase).toBe('connecting');
    const [offer] = emittedOf(EVENTS.signal);
    expect(offer.payload).toEqual({
      callId: answered.id,
      signal: { kind: 'description', description: { type: 'offer', sdp: 'offer-sdp' } },
    });

    act(() => peers[0].setConnection('connected'));
    expect(getCallState().phase).toBe('connected');

    toggleMicrophone();
    expect(getCallState().local.getAudioTracks()[0].enabled).toBe(false);
    expect(emittedOf(EVENTS.media).at(-1).payload).toMatchObject({ audio: false, video: false });

    await act(() => hangUp());
    expect(emittedOf(EVENTS.end).at(-1).payload).toEqual({ callId: answered.id });
    expect(peers[0].close).toHaveBeenCalled();
    expect(allTracks().every((track) => track.stop.mock.calls.length > 0)).toBe(true);
    expect(getCallState()).toMatchObject({ phase: 'ended', local: null, remote: null });
    dismissCall();
    expect(getCallState().phase).toBe('idle');
  });

  it('a denied permission never rings anyone', async () => {
    getUserMedia.mockRejectedValueOnce(Object.assign(new Error('no'), { name: 'NotAllowedError' }));
    await act(() => startCall('64b0000000000000000000d1', 'video'));
    expect(emittedOf(EVENTS.start)).toHaveLength(0);
    expect(getCallState()).toMatchObject({ phase: 'ended', error: { code: 'permission_denied' } });
    expect(getCallState().error.message).toMatch(/camera and microphone was blocked/);
  });

  it('browsers without WebRTC get a clear message', async () => {
    delete window.RTCPeerConnection;
    await act(() => startCall('64b0000000000000000000d1', 'audio'));
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(getCallState().error.message).toMatch(/doesn't support calls/);
  });

  it('a busy person is reported without connecting', async () => {
    socket = fakeSocket({
      [EVENTS.start]: () => ({
        ok: true,
        data: { call: call({ status: 'missed', endReason: 'busy' }), duplicate: false },
      }),
    });
    setRealtimeSocket(socket);
    await act(() => startCall('64b0000000000000000000d1', 'audio'));
    expect(getCallState()).toMatchObject({ phase: 'ended', call: { endReason: 'busy' } });
    expect(allTracks().every((track) => track.stop.mock.calls.length > 0)).toBe(true);
  });

  it('a failed connection restarts ICE, then ends as failed and releases the devices', async () => {
    await act(() => startCall('64b0000000000000000000d1', 'audio'));
    act(() =>
      socket.fire(EVENTS.updated, {
        call: call({ status: 'ongoing', answeredAt: new Date().toISOString() }),
      }),
    );
    await flush();
    const [pc] = peers;
    act(() => pc.setConnection('failed'));
    act(() => pc.setConnection('failed'));
    expect(pc.restartIce).toHaveBeenCalledTimes(2);
    expect(getCallState().phase).toBe('reconnecting');
    act(() => pc.setConnection('failed'));
    expect(emittedOf(EVENTS.end).at(-1).payload).toMatchObject({ reason: 'media_failed' });
    expect(getCallState()).toMatchObject({ phase: 'ended', error: { code: 'media_failed' } });
    expect(pc.close).toHaveBeenCalled();
    expect(allTracks().every((track) => track.stop.mock.calls.length > 0)).toBe(true);
  });

  it('turning the camera on in an audio call adds video', async () => {
    await act(() => startCall('64b0000000000000000000d1', 'audio'));
    act(() =>
      socket.fire(EVENTS.updated, {
        call: call({ status: 'ongoing', answeredAt: new Date().toISOString() }),
      }),
    );
    await flush();
    await act(() => toggleCamera());
    expect(getUserMedia).toHaveBeenLastCalledWith({ video: true });
    expect(peers[0].senders.map((sender) => sender.track.kind)).toEqual(['audio', 'video']);
    expect(getCallState().camera).toBe(true);
  });
});

describe('incoming calls', () => {
  const incoming = () => call({ direction: 'incoming', callerId: 'peer', calleeId: 'me' });

  it('shows one dialog however often the call is announced; accepting answers the offer', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CallManager />);
    await flush();
    act(() => socket.fire(EVENTS.incoming, { call: incoming() }));
    act(() => socket.fire(EVENTS.incoming, { call: incoming() }));
    act(() => socket.fire(EVENTS.updated, { call: incoming() }));
    expect(await screen.findAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Incoming audio call' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Accept' }));
    await flush();
    expect(emittedOf(EVENTS.accept)[0].payload).toEqual({ callId: incoming().id });
    expect(peers).toHaveLength(1);
    // The callee waits for the caller's offer before negotiating.
    expect(emittedOf(EVENTS.signal)).toHaveLength(0);
    act(() =>
      socket.fire(EVENTS.signal, {
        callId: incoming().id,
        signal: { kind: 'description', description: { type: 'offer', sdp: 'remote' } },
      }),
    );
    await flush();
    expect(emittedOf(EVENTS.signal)[0].payload.signal).toEqual({
      kind: 'description',
      description: { type: 'answer', sdp: 'answer-sdp' },
    });
    expect(screen.getByRole('region', { name: 'Call with Grace Hopper' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'End call' })).toHaveFocus();
  });

  it('declining closes the dialog and tells the server', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CallManager />);
    await flush();
    act(() => socket.fire(EVENTS.incoming, { call: incoming() }));
    await user.click(await screen.findByRole('button', { name: 'Decline' }));
    expect(emittedOf(EVENTS.decline)[0].payload).toEqual({ callId: incoming().id });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('answered on another device, or cancelled: the dialog goes away without asking for media', async () => {
    renderWithProviders(<CallManager />);
    await flush();
    act(() => socket.fire(EVENTS.incoming, { call: incoming() }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    act(() =>
      socket.fire(EVENTS.updated, {
        call: { ...incoming(), status: 'ongoing', answeredAt: new Date().toISOString() },
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('a blocked microphone keeps the call ringing with an explanation', async () => {
    getUserMedia.mockRejectedValueOnce(Object.assign(new Error('no'), { name: 'NotAllowedError' }));
    act(() => socket.fire(EVENTS.incoming, { call: incoming() }));
    await act(() => acceptCall());
    expect(emittedOf(EVENTS.accept)).toHaveLength(0);
    expect(getCallState()).toMatchObject({
      phase: 'incoming',
      error: { code: 'permission_denied' },
    });
    await act(() => declineCall());
    expect(getCallState().phase).toBe('idle');
  });
});

describe('lifecycle', () => {
  it('stopping the client removes its listeners and releases the devices', async () => {
    await act(() => startCall('64b0000000000000000000d1', 'video'));
    expect(socket.listenerCount(EVENTS.incoming)).toBe(1);
    stopClient();
    expect(socket.listenerCount(EVENTS.incoming)).toBe(0);
    expect(allTracks().every((track) => track.stop.mock.calls.length > 0)).toBe(true);
    expect(getCallState().phase).toBe('idle');
    stopClient = startCallsClient();
  });

  it('after reconnecting, the device resumes its call', async () => {
    await act(() => startCall('64b0000000000000000000d1', 'audio'));
    act(() => socket.fire('disconnect'));
    expect(getCallState().signalingLost).toBe(true);
    act(() => socket.fire('connect'));
    await flush();
    expect(emittedOf(EVENTS.resume)[0].payload).toEqual({ callId: call().id });
  });
});

describe('call buttons and history text', () => {
  it('are disabled with a reason when calling isn’t allowed', () => {
    render(<CallButtons conversationId="c1" peerName="Grace" unavailable="blocked" />);
    expect(screen.getByRole('button', { name: 'Audio call (blocked)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Video call (blocked)' })).toBeDisabled();
  });

  it('describe each outcome from the viewer’s side', () => {
    expect(callLogText({ type: 'video', status: 'completed', durationSeconds: 125 }, true)).toBe(
      'Outgoing video call · 2:05',
    );
    expect(callLogText({ type: 'audio', status: 'missed', endReason: 'no_answer' }, false)).toBe(
      'Missed audio call',
    );
    expect(callLogText({ type: 'audio', status: 'missed', endReason: 'busy' }, true)).toBe(
      'Audio call — busy',
    );
    expect(callLogText({ type: 'audio', status: 'cancelled' }, false)).toBe('Missed audio call');
    expect(callLogText({ type: 'audio', status: 'declined' }, false)).toBe(
      'You declined an audio call',
    );
    expect(formatCallDuration(3_700)).toBe('1:01:40');
  });
});
