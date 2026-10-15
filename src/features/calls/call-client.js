import { CALL_SOCKET_EVENTS as EVENTS, callSchema } from '#shared';
import { useSyncExternalStore } from 'react';
import { onRealtimeSocket } from '../../lib/realtime-socket';
import { emitWithAck, newClientMessageId } from '../messaging/messaging-client';
import { getIceServers } from './api';
import {
  callUnsupportedReason,
  getCallMedia,
  getCameraTrack,
  getMicrophoneTrack,
  stopStream,
} from './media';
import { createPeer } from './peer';

/**
 * The signed-in user's call, on this tab. The server decides the call's state; this module
 * mirrors it, owns the camera/microphone and the peer connection, and releases all of them
 * whenever the call ends, the user signs out or the shell unmounts.
 *
 * Phases: idle → starting → outgoing → connecting → connected (⇄ reconnecting) → ended;
 * idle → incoming → answering → connecting → …. Events are applied by call id, so a repeated
 * or late event never opens a second dialog or screen.
 */

const ENDED_DISPLAY_MS = 4_000;
/** No media connection after this long (first connection or after a drop): restart ICE. */
const CONNECT_TIMEOUT_MS = 20_000;
/** A dropped connection gets this long to recover on its own before ICE is restarted. */
const DISCONNECTED_WAIT_MS = 5_000;
const MAX_ICE_RESTARTS = 2;
const ACTIVE_PHASES = ['outgoing', 'connecting', 'connected', 'reconnecting'];

const initialState = () => ({
  phase: 'idle',
  call: null,
  error: null,
  local: null,
  remote: null,
  mic: true,
  camera: false,
  remoteMedia: { audio: true, video: true },
  speakerId: null,
  /** The connection to the server dropped (media may still flow); it resumes on reconnect. */
  signalingLost: false,
});

let state = initialState();
const listeners = new Set();

function setState(patch) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCallState() {
  return state;
}

/** Reads part of the call state (the selector must return something already in the state). */
export function useCallState(selector = (current) => current) {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(state),
  );
}

// Resources that are not rendered.
let peer = null;
let pendingSignals = [];
/** Events for calls that arrived while this tab was starting one (before the ack). */
let earlyEvents = new Map();
let endedTimer;
let connectTimer;
let iceRestarts = 0;

const isCurrent = (callId) => Boolean(callId) && state.call?.id === callId;

/** Closes the peer connection, stops every track and clears timers. Safe to call repeatedly. */
function release() {
  peer?.close();
  peer = null;
  stopStream(state.local);
  pendingSignals = [];
  clearTimeout(connectTimer);
  connectTimer = undefined;
  iceRestarts = 0;
}

function showEnded(call, error = null) {
  release();
  clearTimeout(endedTimer);
  setState({ ...initialState(), phase: 'ended', call, error });
  endedTimer = setTimeout(() => {
    if (state.phase === 'ended') setState(initialState());
  }, ENDED_DISPLAY_MS);
}

/** Closes the "call ended" screen. */
export function dismissCall() {
  clearTimeout(endedTimer);
  if (state.phase === 'ended') setState(initialState());
}

function sendSignal(signal) {
  const callId = state.call?.id;
  if (!callId) return;
  // A lost signal is recovered by ICE restarts or the reconnection flow.
  emitWithAck(EVENTS.signal, { callId, signal }).catch(() => undefined);
}

function sendMediaState() {
  const callId = state.call?.id;
  if (!callId || !['connecting', 'connected', 'reconnecting'].includes(state.phase)) return;
  emitWithAck(EVENTS.media, { callId, audio: state.mic, video: state.camera }).catch(
    () => undefined,
  );
}

function fail(message = "The call couldn't connect. Check your connection and try again.") {
  const call = state.call;
  if (call) {
    emitWithAck(EVENTS.end, { callId: call.id, reason: 'media_failed' }).catch(() => undefined);
  }
  showEnded(call ? { ...call, status: 'failed', endReason: 'media_failed' } : null, {
    code: 'media_failed',
    message,
  });
}

function restartIceOrFail() {
  if (!peer) return;
  if (iceRestarts >= MAX_ICE_RESTARTS) {
    fail();
    return;
  }
  iceRestarts += 1;
  peer.restartIce();
  armConnectTimer();
}

function armConnectTimer(delay = CONNECT_TIMEOUT_MS) {
  clearTimeout(connectTimer);
  connectTimer = setTimeout(() => {
    if (state.phase !== 'connected') restartIceOrFail();
  }, delay);
}

function onConnectionState(connection) {
  if (connection === 'connected') {
    clearTimeout(connectTimer);
    iceRestarts = 0;
    setState({ phase: 'connected' });
  } else if (connection === 'disconnected') {
    setState({ phase: 'reconnecting' });
    armConnectTimer(DISCONNECTED_WAIT_MS);
  } else if (connection === 'failed') {
    setState({ phase: 'reconnecting' });
    restartIceOrFail();
  }
}

async function connectPeer(polite) {
  let iceServers = [];
  try {
    ({ iceServers } = await getIceServers());
  } catch {
    // Without STUN/TURN a direct connection (same network) may still work.
  }
  if (!state.call || !state.local || peer) return;
  peer = createPeer({
    iceServers,
    polite,
    localStream: state.local,
    sendSignal,
    onRemoteStream: (remote) => setState({ remote }),
    onConnectionState,
  });
  for (const signal of pendingSignals.splice(0)) void peer.handleSignal(signal);
  armConnectTimer();
}

/** Applies the server's view of a call (ack, call:incoming, call:updated, call:active). */
function applyCall(raw) {
  const parsed = callSchema.safeParse(raw);
  if (!parsed.success) return;
  const call = parsed.data;
  const final = call.status !== 'ringing' && call.status !== 'ongoing';

  if (state.phase === 'starting' && !state.call) {
    earlyEvents.set(call.id, call);
    return;
  }

  if (!isCurrent(call.id)) {
    // Someone is calling while this tab is free: ring (once, however often it's announced).
    if (
      call.status === 'ringing' &&
      call.direction === 'incoming' &&
      (state.phase === 'idle' || state.phase === 'ended')
    ) {
      clearTimeout(endedTimer);
      setState({ ...initialState(), phase: 'incoming', call });
    }
    return;
  }

  if (final) {
    if (state.phase === 'incoming') {
      // Missed or cancelled before this tab answered: nothing to show (a notification follows).
      release();
      setState(initialState());
    } else {
      showEnded(call, state.phase === 'ended' ? state.error : null);
    }
    return;
  }

  if (call.status === 'ongoing') {
    if (state.phase === 'incoming') {
      // Answered on another of your devices.
      release();
      setState(initialState());
    } else if (state.phase === 'outgoing') {
      setState({ call, phase: 'connecting' });
      void connectPeer(false);
    } else {
      setState({ call });
    }
    return;
  }

  setState({ call });
}

// ── Actions ───────────────────────────────────────────────────────────────

/** Calls the other person in a one-to-one conversation. */
export async function startCall(conversationId, type) {
  if (state.phase !== 'idle' && state.phase !== 'ended') return;
  clearTimeout(endedTimer);
  const unsupported = callUnsupportedReason();
  if (unsupported) {
    showEnded(null, { code: 'unsupported', message: unsupported });
    return;
  }
  earlyEvents = new Map();
  setState({ ...initialState(), phase: 'starting', camera: type === 'video' });

  let local;
  try {
    // Permission first: nobody is rung if your microphone or camera can't be used.
    local = await getCallMedia(type);
  } catch (error) {
    showEnded(null, { code: error.code, message: error.message });
    return;
  }
  if (state.phase !== 'starting') {
    stopStream(local);
    return;
  }
  setState({ local });

  try {
    const { call } = await emitWithAck(EVENTS.start, {
      conversationId,
      type,
      clientCallId: newClientMessageId(),
    });
    if (state.phase !== 'starting') {
      // Hung up while it was starting.
      emitWithAck(EVENTS.end, { callId: call.id }).catch(() => undefined);
      return;
    }
    setState({ call, phase: call.status === 'ringing' ? 'outgoing' : 'starting' });
    if (call.status !== 'ringing') {
      showEnded(call);
      return;
    }
    const newer = earlyEvents.get(call.id);
    earlyEvents = new Map();
    if (newer) applyCall(newer);
  } catch (error) {
    showEnded(null, {
      code: error.code,
      message:
        error.code === 'ALREADY_IN_CALL' ? 'You already have a call in progress.' : error.message,
    });
    if (error.code === 'ALREADY_IN_CALL') void syncActive();
  }
}

/** Answers the ringing call on this device. */
export async function acceptCall() {
  if (state.phase !== 'incoming') return;
  const { call } = state;
  setState({ phase: 'answering', error: null });
  let local;
  try {
    local = await getCallMedia(call.type);
  } catch (error) {
    if (isCurrent(call.id) && state.phase === 'answering') {
      setState({ phase: 'incoming', error: { code: error.code, message: error.message } });
    }
    return;
  }
  if (!isCurrent(call.id) || state.phase !== 'answering') {
    stopStream(local);
    return;
  }
  setState({ local, camera: call.type === 'video', phase: 'connecting' });
  // Ready before the caller's offer can arrive.
  await connectPeer(true);
  try {
    const { call: answered } = await emitWithAck(EVENTS.accept, { callId: call.id });
    applyCall(answered);
  } catch (error) {
    showEnded(state.call, {
      code: error.code,
      message:
        error.code === 'CALL_NOT_RINGING' ? 'This call is no longer ringing.' : error.message,
    });
  }
}

export async function declineCall() {
  if (state.phase !== 'incoming' && state.phase !== 'answering') return;
  const callId = state.call.id;
  release();
  setState(initialState());
  await emitWithAck(EVENTS.decline, { callId }).catch(() => undefined);
}

/** Hangs up (or cancels a call that is still ringing). */
export async function hangUp() {
  const { call, phase } = state;
  if (phase === 'idle' || phase === 'ended') return;
  if (!call) {
    // Still asking for permission: startCall notices and stops.
    release();
    setState(initialState());
    return;
  }
  showEnded(call);
  try {
    const { call: ended } = await emitWithAck(EVENTS.end, { callId: call.id });
    if (state.phase === 'ended' && isCurrent(ended.id)) setState({ call: ended });
  } catch {
    // The server ends it anyway once this device is gone (see the reconnection grace).
  }
}

export function toggleMicrophone() {
  const tracks = state.local?.getAudioTracks() ?? [];
  const mic = !state.mic;
  for (const track of tracks) track.enabled = mic;
  setState({ mic });
  sendMediaState();
}

/** Camera off/on; in an audio call, turning it on adds video (the call is renegotiated). */
export async function toggleCamera() {
  const local = state.local;
  if (!local) return;
  const [track] = local.getVideoTracks();
  if (track) {
    track.enabled = !state.camera;
    setState({ camera: !state.camera });
    sendMediaState();
    return;
  }
  try {
    const camera = await getCameraTrack();
    if (state.local !== local || !peer) {
      camera.stop();
      return;
    }
    local.addTrack(camera);
    await peer.setTrack('video', camera);
    setState({ camera: true, local, error: null });
    sendMediaState();
  } catch (error) {
    setState({ error: { code: error.code, message: error.message } });
  }
}

/** Switches the microphone, camera or speaker during a call. */
export async function switchDevice(kind, deviceId) {
  if (kind === 'audiooutput') {
    setState({ speakerId: deviceId });
    return;
  }
  const local = state.local;
  if (!local || !peer) return;
  try {
    const next =
      kind === 'audioinput' ? await getMicrophoneTrack(deviceId) : await getCameraTrack(deviceId);
    const previous = kind === 'audioinput' ? local.getAudioTracks()[0] : local.getVideoTracks()[0];
    next.enabled = kind === 'audioinput' ? state.mic : state.camera;
    await peer.setTrack(kind === 'audioinput' ? 'audio' : 'video', next);
    if (previous) {
      local.removeTrack(previous);
      previous.stop();
    }
    local.addTrack(next);
    setState({ local, error: null });
  } catch (error) {
    setState({ error: { code: error.code, message: error.message } });
  }
}

// ── Socket events ─────────────────────────────────────────────────────────

function syncActive() {
  return emitWithAck(EVENTS.active, {})
    .then(({ call }) => {
      if (call) applyCall(call);
      else if (state.phase === 'incoming') setState(initialState());
    })
    .catch(() => undefined);
}

function onConnect() {
  if (state.call && ACTIVE_PHASES.includes(state.phase)) {
    // This device reconnected: take the call back over (the other side restarts ICE).
    emitWithAck(EVENTS.resume, { callId: state.call.id })
      .then(({ call }) => {
        setState({ signalingLost: false });
        applyCall(call);
      })
      .catch(() => {
        showEnded(state.call, { code: 'connection_lost', message: 'The call was disconnected.' });
      });
  } else {
    void syncActive();
  }
}

function onDisconnect() {
  if (state.call && ACTIVE_PHASES.includes(state.phase)) setState({ signalingLost: true });
}

const handlers = {
  connect: onConnect,
  disconnect: onDisconnect,
  [EVENTS.incoming]: (payload) => applyCall(payload?.call),
  [EVENTS.updated]: (payload) => applyCall(payload?.call),
  [EVENTS.signal]: ({ callId, signal } = {}) => {
    if (!isCurrent(callId) || !signal) return;
    if (peer) void peer.handleSignal(signal);
    else pendingSignals.push(signal);
  },
  [EVENTS.media]: ({ callId, audio, video } = {}) => {
    if (isCurrent(callId))
      setState({ remoteMedia: { audio: Boolean(audio), video: Boolean(video) } });
  },
  [EVENTS.resumed]: ({ callId } = {}) => {
    if (isCurrent(callId) && peer) {
      iceRestarts = 0;
      peer.restartIce();
      armConnectTimer();
    }
  },
};

/** Leaving the page ends your call right away (instead of after the reconnection grace). */
function onPageHide() {
  if (state.call && (ACTIVE_PHASES.includes(state.phase) || state.phase === 'answering')) {
    emitWithAck(EVENTS.end, { callId: state.call.id }).catch(() => undefined);
  }
}

/**
 * Connects calls to the app's socket while the signed-in shell is shown.
 * @returns {() => void} Stops listening and releases every call resource.
 */
export function startCallsClient() {
  let attached = null;
  const detach = () => {
    if (!attached) return;
    for (const [event, handler] of Object.entries(handlers)) attached.off?.(event, handler);
    attached = null;
  };
  const stopListening = onRealtimeSocket((socket) => {
    detach();
    if (!socket) return;
    attached = socket;
    for (const [event, handler] of Object.entries(handlers)) socket.on(event, handler);
    if (socket.connected) onConnect();
  });
  window.addEventListener('pagehide', onPageHide);
  return () => {
    stopListening();
    detach();
    window.removeEventListener('pagehide', onPageHide);
    clearTimeout(endedTimer);
    release();
    setState(initialState());
  };
}
