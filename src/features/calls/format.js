/** 75 → "1:15"; 3700 → "1:01:40". */
export function formatCallDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds ?? 0));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

/**
 * One line for a call in a conversation's history, from the viewer's side, e.g.
 * "Outgoing video call · 2:05", "Missed audio call", "Audio call — no answer".
 */
export function callLogText(call, outgoing) {
  const kind = call?.type === 'video' ? 'video call' : 'audio call';
  const Kind = `${kind[0].toUpperCase()}${kind.slice(1)}`;
  switch (call?.status) {
    case 'completed':
      return `${outgoing ? 'Outgoing' : 'Incoming'} ${kind} · ${formatCallDuration(call.durationSeconds)}`;
    case 'missed':
      if (!outgoing) return `Missed ${kind}`;
      return call.endReason === 'busy' ? `${Kind} — busy` : `${Kind} — no answer`;
    case 'cancelled':
      return outgoing ? `Cancelled ${kind}` : `Missed ${kind}`;
    case 'declined':
      return outgoing
        ? `${Kind} declined`
        : `You declined ${call.type === 'video' ? 'a' : 'an'} ${kind}`;
    case 'failed':
      return `${Kind} failed`;
    default:
      return Kind;
  }
}
