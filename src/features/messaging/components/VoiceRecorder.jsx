import { ATTACHMENT_MAX_BYTES } from '#shared';
import { Mic, Send, Square, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { IconButton } from '../../../components/ui/Button';

const MAX_SECONDS = 120;
/** Browsers record different formats; use the first one this browser supports. */
const CANDIDATE_TYPES = [
  ['audio/webm;codecs=opus', 'webm'],
  ['audio/ogg;codecs=opus', 'ogg'],
  ['audio/mp4', 'm4a'],
  ['audio/webm', 'webm'],
];

function pickFormat() {
  if (typeof MediaRecorder === 'undefined') return null;
  if (typeof MediaRecorder.isTypeSupported !== 'function') return CANDIDATE_TYPES[0];
  return CANDIDATE_TYPES.find(([type]) => MediaRecorder.isTypeSupported(type)) ?? null;
}

function isRecordingSupported() {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    pickFormat() !== null
  );
}

const formatDuration = (seconds) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/**
 * Records a voice message with the microphone (MediaRecorder). Handles unsupported browsers,
 * denied permission and missing microphones, and stops automatically after two minutes so the
 * file stays well under 5 MB. `onRecorded(file)` receives the recording.
 */
export function VoiceRecorder({ onRecorded, onError, disabled }) {
  const [state, setState] = useState('idle');
  const [seconds, setSeconds] = useState(0);
  const recording = useRef(null);
  const supported = isRecordingSupported();

  const release = () => {
    const current = recording.current;
    if (!current) return;
    clearInterval(current.timer);
    current.stream.getTracks().forEach((track) => track.stop());
    recording.current = null;
  };

  useEffect(
    () => () => {
      if (recording.current?.recorder.state === 'recording') {
        recording.current.discard = true;
        recording.current.recorder.stop();
      }
      release();
    },
    [],
  );

  const finish = (send) => {
    const current = recording.current;
    if (!current) return;
    current.discard = !send;
    if (current.recorder.state !== 'inactive') current.recorder.stop();
  };

  const start = async () => {
    const format = pickFormat();
    if (!format) {
      onError?.("Voice recording isn't supported in this browser.");
      return;
    }
    setState('requesting');
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      setState('idle');
      onError?.(
        error?.name === 'NotAllowedError' || error?.name === 'SecurityError'
          ? 'Microphone access was denied. Allow it in your browser settings to record.'
          : 'No microphone is available.',
      );
      return;
    }
    const [mimeType, extension] = format;
    let recorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32_000 });
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setState('idle');
      onError?.("Voice recording isn't supported in this browser.");
      return;
    }
    const chunks = [];
    const current = { recorder, stream, chunks, discard: false, timer: null };
    recording.current = current;
    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunks.push(event.data);
    };
    recorder.onstop = () => {
      const { discard } = current;
      release();
      setState('idle');
      setSeconds(0);
      if (discard) return;
      const type = mimeType.split(';')[0];
      const blob = new Blob(chunks, { type });
      if (blob.size === 0) {
        onError?.('Nothing was recorded. Try again.');
        return;
      }
      if (blob.size > ATTACHMENT_MAX_BYTES) {
        onError?.('The recording is larger than 5 MB.');
        return;
      }
      onRecorded(new File([blob], `voice-message.${extension}`, { type }));
    };
    recorder.start(1_000);
    setState('recording');
    current.timer = setInterval(() => {
      setSeconds((value) => {
        if (value + 1 >= MAX_SECONDS) finish(true);
        return value + 1;
      });
    }, 1_000);
  };

  if (state === 'recording') {
    return (
      <div className="flex items-center gap-1" role="group" aria-label="Recording voice message">
        <span className="flex items-center gap-1.5 px-2 text-sm text-danger-700" aria-live="polite">
          <span
            aria-hidden="true"
            className="size-2 rounded-full bg-danger-600 motion-safe:animate-pulse"
          />
          {formatDuration(seconds)}
        </span>
        <IconButton label="Cancel recording" icon={X} onClick={() => finish(false)} />
        <IconButton
          label="Send voice message"
          icon={Send}
          variant="primary"
          onClick={() => finish(true)}
        />
      </div>
    );
  }
  return (
    <IconButton
      label={
        supported ? 'Record a voice message' : "Voice recording isn't supported in this browser"
      }
      icon={state === 'requesting' ? Square : Mic}
      disabled={disabled || !supported || state === 'requesting'}
      onClick={() => void start()}
    />
  );
}
