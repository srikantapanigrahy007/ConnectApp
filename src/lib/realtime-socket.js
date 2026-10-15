/**
 * The app's single authenticated Socket.IO connection (created by useSessionSocket while signed
 * in), shared with features that send and receive real-time events, such as messaging.
 *
 * Connection states: "offline" (no socket), "connecting", "connected", "reconnecting".
 */

let current = null;
let state = 'offline';
const socketListeners = new Set();
const stateListeners = new Set();

export function setRealtimeSocket(socket) {
  current = socket;
  for (const listener of socketListeners) listener(socket);
}

export function getRealtimeSocket() {
  return current;
}

/** Calls `listener(socket | null)` now and whenever the socket is replaced. */
export function onRealtimeSocket(listener) {
  socketListeners.add(listener);
  listener(current);
  return () => socketListeners.delete(listener);
}

export function setConnectionState(next) {
  if (next === state) return;
  state = next;
  for (const listener of stateListeners) listener(state);
}

export function getConnectionState() {
  return state;
}

export function onConnectionState(listener) {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}
