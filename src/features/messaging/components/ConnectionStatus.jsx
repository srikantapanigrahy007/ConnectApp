import { WifiOff } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { useConnectionState } from '../hooks';

/**
 * Shows while real-time messaging is reconnecting. Messages sent meanwhile go over HTTP (or fail
 * with Retry), and missed messages are synchronised as soon as the connection is back.
 */
export function ConnectionStatus({ className }) {
  const state = useConnectionState();
  if (state !== 'reconnecting') return null;
  return (
    <p
      role="status"
      className={cn(
        'flex items-center gap-2 rounded-lg bg-warning-50 px-3 py-2 text-xs font-medium text-warning-800',
        className,
      )}
    >
      <WifiOff aria-hidden="true" className="size-3.5 shrink-0" />
      Reconnecting… Missed messages will appear when you’re back online.
    </p>
  );
}
