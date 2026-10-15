/** Camera and microphone access for calls. */

export class CallMediaError extends Error {
  /** @param {'unsupported' | 'permission_denied' | 'no_device' | 'in_use'} code */
  constructor(code, message) {
    super(message);
    this.name = 'CallMediaError';
    this.code = code;
  }
}

/** Why this browser can't make calls, or null when it can. */
export function callUnsupportedReason() {
  if (typeof window === 'undefined' || typeof window.RTCPeerConnection !== 'function') {
    return "This browser doesn't support calls. Try a recent version of Chrome, Edge, Firefox or Safari.";
  }
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.mediaDevices?.getUserMedia !== 'function'
  ) {
    return 'Calls need camera and microphone access, which this browser only allows on secure (https) pages.';
  }
  return null;
}

const constraintsFor = (type, devices = {}) => ({
  audio: devices.audioinput ? { deviceId: { exact: devices.audioinput } } : true,
  video:
    type === 'video'
      ? devices.videoinput
        ? { deviceId: { exact: devices.videoinput } }
        : { width: { ideal: 1280 }, height: { ideal: 720 } }
      : false,
});

function toMediaError(error, type) {
  const what = type === 'video' ? 'camera and microphone' : 'microphone';
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new CallMediaError(
        'permission_denied',
        `Access to your ${what} was blocked. Allow it in your browser's site settings, then try again.`,
      );
    case 'NotFoundError':
    case 'OverconstrainedError':
      return new CallMediaError('no_device', `No ${what} was found.`);
    case 'NotReadableError':
    case 'AbortError':
      return new CallMediaError(
        'in_use',
        `Your ${what} is being used by another app. Close it and try again.`,
      );
    default:
      return new CallMediaError('unsupported', `Couldn't start your ${what}.`);
  }
}

/** Microphone (and camera for video). Throws CallMediaError with a message to show. */
export async function getCallMedia(type, devices) {
  const unsupported = callUnsupportedReason();
  if (unsupported) throw new CallMediaError('unsupported', unsupported);
  try {
    return await navigator.mediaDevices.getUserMedia(constraintsFor(type, devices));
  } catch (error) {
    throw toMediaError(error, type);
  }
}

/** Just a camera track (turning video on during a call, or switching cameras). */
export async function getCameraTrack(deviceId) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: deviceId ? { deviceId: { exact: deviceId } } : true,
    });
    return stream.getVideoTracks()[0];
  } catch (error) {
    throw toMediaError(error, 'video');
  }
}

/** Just a microphone track (switching microphones). */
export async function getMicrophoneTrack(deviceId) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    });
    return stream.getAudioTracks()[0];
  } catch (error) {
    throw toMediaError(error, 'audio');
  }
}

/** Stops every track, which releases the camera and microphone. */
export function stopStream(stream) {
  for (const track of stream?.getTracks?.() ?? []) track.stop();
}

/** Available devices by kind (labels appear once permission was granted). */
export async function listDevices() {
  const result = { audioinput: [], videoinput: [], audiooutput: [] };
  if (typeof navigator.mediaDevices?.enumerateDevices !== 'function') return result;
  try {
    for (const device of await navigator.mediaDevices.enumerateDevices()) {
      if (result[device.kind] && device.deviceId) result[device.kind].push(device);
    }
  } catch {
    // Device lists are optional.
  }
  return result;
}

/** Whether audio output (speaker) can be chosen in this browser. */
export const canChooseSpeaker = () =>
  typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
