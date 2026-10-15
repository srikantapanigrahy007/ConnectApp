import { Mic, MicOff, PhoneOff, Settings2, Video, VideoOff, WifiOff, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Avatar } from '../../../components/ui/Avatar';
import { Select } from '../../../components/ui/FormControls';
import { cn } from '../../../lib/cn';
import {
  dismissCall,
  hangUp,
  switchDevice,
  toggleCamera,
  toggleMicrophone,
  useCallState,
} from '../call-client';
import { formatCallDuration } from '../format';
import { canChooseSpeaker, listDevices } from '../media';

/**
 * Attaches a MediaStream to a <video>/<audio> element (srcObject can't be set as a prop).
 * `visible` re-attaches when a conditionally rendered element appears.
 */
function useMediaStream(ref, stream, { sinkId, visible = true } = {}) {
  useEffect(() => {
    const element = ref.current;
    if (!element || !visible) return undefined;
    element.srcObject = stream ?? null;
    if (stream) element.play?.()?.catch?.(() => undefined);
    return () => {
      element.srcObject = null;
    };
  }, [ref, stream, visible]);
  useEffect(() => {
    const element = ref.current;
    if (sinkId && element && typeof element.setSinkId === 'function') {
      element.setSinkId(sinkId).catch(() => undefined);
    }
  }, [ref, sinkId]);
}

/** Seconds since `since`, updated every second while mounted. */
function useElapsed(since) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [since]);
  return since ? Math.max(0, Math.floor((now - new Date(since).getTime()) / 1_000)) : 0;
}

function endedText(call, error) {
  if (error?.message) return error.message;
  if (!call) return 'Call ended';
  const name = call.peer.displayName;
  switch (call.status) {
    case 'completed':
      return call.durationSeconds !== null
        ? `Call ended · ${formatCallDuration(call.durationSeconds)}`
        : 'Call ended';
    case 'missed':
      if (call.endReason === 'busy') return `${name} is on another call`;
      return call.direction === 'outgoing' ? 'No answer' : 'Missed call';
    case 'declined':
      return call.direction === 'outgoing' ? `${name} declined the call` : 'Call declined';
    case 'cancelled':
      return 'Call cancelled';
    case 'failed':
      return 'Call failed';
    default:
      return 'Call ended';
  }
}

function ControlButton({ label, pressed, onClick, icon: Icon, tone = 'default', ref }) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'flex size-14 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
        tone === 'danger'
          ? 'bg-danger-600 text-white hover:bg-danger-700'
          : pressed
            ? 'bg-white text-zinc-900 hover:bg-zinc-200'
            : 'bg-white/15 text-white hover:bg-white/25',
      )}
    >
      <Icon aria-hidden="true" className="size-6" />
    </button>
  );
}

/** Microphone, camera and speaker pickers (only what the browser supports). */
function DeviceSettings({ onClose, hasVideo }) {
  const [devices, setDevices] = useState(null);
  const titleId = useId();
  useEffect(() => {
    let active = true;
    void listDevices().then((found) => {
      if (active) setDevices(found);
    });
    return () => {
      active = false;
    };
  }, []);

  const picker = (kind, label) =>
    devices && devices[kind].length > 0 ? (
      <label className="block text-sm">
        <span className="mb-1 block font-medium">{label}</span>
        <Select
          defaultValue=""
          onChange={(event) => void switchDevice(kind, event.target.value)}
          className="text-ink"
        >
          <option value="" disabled>
            Choose…
          </option>
          {devices[kind].map((device, index) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `${label} ${index + 1}`}
            </option>
          ))}
        </Select>
      </label>
    ) : null;

  return (
    <div
      role="dialog"
      aria-labelledby={titleId}
      className="absolute bottom-24 left-1/2 w-72 max-w-[calc(100vw-2rem)] -translate-x-1/2 space-y-3 rounded-xl bg-zinc-800 p-4 text-white shadow-xl"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <div className="flex items-center justify-between">
        <h2 id={titleId} className="text-sm font-semibold">
          Devices
        </h2>
        <button
          type="button"
          aria-label="Close device settings"
          onClick={onClose}
          className="rounded p-1 hover:bg-white/10"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
      {devices === null ? <p className="text-sm text-zinc-300">Loading devices…</p> : null}
      {picker('audioinput', 'Microphone')}
      {hasVideo ? picker('videoinput', 'Camera') : null}
      {canChooseSpeaker() ? picker('audiooutput', 'Speaker') : null}
    </div>
  );
}

/**
 * Full-screen call view (outgoing, connecting, connected, reconnecting, ended): remote video or
 * the other person's avatar, your own preview, and the controls.
 */
export function CallScreen() {
  const { phase, call, error, local, remote, mic, camera, remoteMedia, speakerId, signalingLost } =
    useCallState();
  const remoteVideo = useRef(null);
  const remoteAudio = useRef(null);
  const localVideo = useRef(null);
  const endButton = useRef(null);
  const [devicesOpen, setDevicesOpen] = useState(false);
  const elapsed = useElapsed(
    phase === 'connected' || phase === 'reconnecting' ? call?.answeredAt : null,
  );

  const ended = phase === 'ended';
  const showRemoteVideo = Boolean(remote?.getVideoTracks().length) && remoteMedia.video && !ended;
  const showLocalVideo = camera && Boolean(local?.getVideoTracks().length) && !ended;

  useMediaStream(remoteAudio, remote, { sinkId: speakerId });
  useMediaStream(remoteVideo, remote, { visible: showRemoteVideo });
  useMediaStream(localVideo, local, { visible: showLocalVideo });

  useEffect(() => {
    if (!ended) endButton.current?.focus();
  }, [ended]);

  const name = call?.peer.displayName ?? 'Call';
  const status = {
    starting: 'Starting…',
    outgoing: 'Ringing…',
    connecting: 'Connecting…',
    connected: formatCallDuration(elapsed),
    reconnecting: 'Reconnecting…',
    ended: endedText(call, error),
  }[phase];

  return (
    <section
      aria-label={`Call with ${name}`}
      className="fixed inset-0 z-40 flex flex-col bg-zinc-950 text-white"
    >
      {/* Sound always plays through this element; the videos are muted. */}
      <audio ref={remoteAudio} autoPlay />
      <div className="relative min-h-0 flex-1">
        {showRemoteVideo ? (
          <video
            ref={remoteVideo}
            autoPlay
            playsInline
            muted
            aria-label={`${name}'s video`}
            className="size-full object-contain"
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-4 px-6 text-center">
            <Avatar name={name} src={call?.peer.avatarUrl} size="xl" decorative />
            <div>
              <h2 className="text-2xl font-semibold">{name}</h2>
              <p
                className="mt-1 text-sm text-zinc-300"
                role={ended ? 'status' : undefined}
                aria-live="polite"
              >
                {status}
              </p>
              {!ended && !remoteMedia.audio ? (
                <p className="mt-1 text-xs text-zinc-400">{name} muted their microphone</p>
              ) : null}
            </div>
          </div>
        )}
        {showRemoteVideo ? (
          <div className="absolute top-4 left-4 rounded-lg bg-black/50 px-3 py-1.5 text-sm">
            <span className="font-medium">{name}</span>
            <span className="ml-2 text-zinc-300" aria-live="polite">
              {status}
            </span>
          </div>
        ) : null}
        {showLocalVideo ? (
          <video
            ref={localVideo}
            autoPlay
            playsInline
            muted
            aria-label="Your camera"
            className="absolute right-4 bottom-4 w-28 -scale-x-100 rounded-lg border border-white/20 bg-black object-cover shadow-lg sm:w-44"
          />
        ) : null}
        {signalingLost && !ended ? (
          <p
            role="status"
            className="absolute inset-x-4 top-4 mx-auto flex w-fit items-center gap-2 rounded-full bg-warning-500 px-3 py-1 text-sm text-ink"
          >
            <WifiOff aria-hidden="true" className="size-4" /> Connection to Connect lost.
            Reconnecting…
          </p>
        ) : null}
        {error && !ended ? (
          <p
            role="alert"
            className="absolute inset-x-4 top-14 mx-auto w-fit max-w-md rounded-lg bg-danger-600 px-3 py-2 text-sm"
          >
            {error.message}
          </p>
        ) : null}
      </div>

      <div className="relative flex shrink-0 items-center justify-center gap-4 px-4 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {ended ? (
          <button
            type="button"
            onClick={dismissCall}
            className="rounded-full bg-white/15 px-6 py-3 text-sm font-medium hover:bg-white/25"
          >
            Close
          </button>
        ) : (
          <>
            <ControlButton
              label={mic ? 'Mute microphone' : 'Unmute microphone'}
              pressed={!mic}
              icon={mic ? Mic : MicOff}
              onClick={toggleMicrophone}
            />
            <ControlButton
              label={camera ? 'Turn camera off' : 'Turn camera on'}
              pressed={camera}
              icon={camera ? Video : VideoOff}
              onClick={() => void toggleCamera()}
            />
            <ControlButton
              label="Devices"
              pressed={devicesOpen}
              icon={Settings2}
              onClick={() => setDevicesOpen((open) => !open)}
            />
            <ControlButton
              ref={endButton}
              label={phase === 'outgoing' || phase === 'starting' ? 'Cancel call' : 'End call'}
              icon={PhoneOff}
              tone="danger"
              onClick={() => void hangUp()}
            />
            {devicesOpen ? (
              <DeviceSettings
                hasVideo={camera || call?.type === 'video'}
                onClose={() => setDevicesOpen(false)}
              />
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
