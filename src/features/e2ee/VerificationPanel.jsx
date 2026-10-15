import { useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { e2eeClient } from './e2ee-client';
import { peerDevicesKey, usePeerDevices } from './hooks';

const POLL_MS = 1_500;

const STATUS_TEXT = {
  waiting: 'Waiting for them to respond on their device…',
  waiting_for_them: 'Waiting for them to confirm…',
  done: 'Verified.',
  cancelled: 'Verification was cancelled. Nothing was marked as verified.',
};

/**
 * SAS emoji verification of the other person's devices (checkpoint F). Both people open this
 * panel; each compares the 7 emoji with the other's screen (in person or on a call). A device is
 * shown as verified only when the library says so after both confirmed.
 */
export function VerificationPanel({ peerId, peerName }) {
  const queryClient = useQueryClient();
  const devices = usePeerDevices(peerId, true);
  const [flow, setFlow] = useState(null);
  const [step, setStep] = useState(null);
  const [incoming, setIncoming] = useState([]);
  const [error, setError] = useState(null);

  // Drive the active flow, and look for requests from them, while the panel is open.
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        await e2eeClient.syncNow();
        if (flow) {
          const next = await e2eeClient.verificationStep(peerId, flow.flowId, {
            accept: flow.incoming,
          });
          if (!stopped) setStep(next);
          if (next.status === 'done') {
            void queryClient.invalidateQueries({ queryKey: peerDevicesKey(peerId) });
          }
        } else if (!stopped) {
          setIncoming(await e2eeClient.incomingVerifications(peerId));
        }
      } catch (failure) {
        if (!stopped) setError(failure?.message ?? 'Verification failed.');
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [flow, peerId, queryClient]);

  const act = async (task) => {
    setError(null);
    try {
      await task();
    } catch (failure) {
      setError(failure?.message ?? 'Verification failed.');
    }
  };
  const start = (deviceId) =>
    act(async () => {
      setStep(null);
      setFlow({ flowId: await e2eeClient.requestVerification(peerId, deviceId), incoming: false });
    });

  if (flow) {
    const finished = step?.status === 'done' || step?.status === 'cancelled';
    return (
      <div className="space-y-3 rounded-xl border border-border p-3" aria-live="polite">
        {step?.status === 'compare' ? (
          <>
            <p className="text-sm">Check that {peerName} sees the same emoji, in the same order:</p>
            <ul className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {step.emoji.map((item, index) => (
                <li key={index} className="flex flex-col items-center text-center text-xs">
                  <span aria-hidden="true" className="text-2xl">
                    {item.symbol}
                  </span>
                  {item.description}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => void act(() => e2eeClient.confirmVerification(peerId, flow.flowId))}
              >
                They match
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void act(() => e2eeClient.cancelVerification(peerId, flow.flowId))}
              >
                They don’t match
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm">{STATUS_TEXT[step?.status] ?? STATUS_TEXT.waiting}</p>
        )}
        {finished ? (
          <Button size="sm" variant="secondary" onClick={() => setFlow(null)}>
            Back to devices
          </Button>
        ) : step?.status !== 'compare' ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              void act(async () => {
                await e2eeClient.cancelVerification(peerId, flow.flowId);
                setFlow(null);
              })
            }
          >
            Cancel
          </Button>
        ) : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{peerName}’s devices</h3>
      {incoming.map((request) => (
        <Alert key={request.flowId} tone="info">
          {peerName} wants to verify with this device.{' '}
          <Button
            size="sm"
            onClick={() => {
              setStep(null);
              setFlow({ flowId: request.flowId, incoming: true });
            }}
          >
            Respond
          </Button>
        </Alert>
      ))}
      {devices.isPending ? <p className="text-sm text-ink-muted">Loading devices…</p> : null}
      <ul className="space-y-1">
        {(devices.data ?? []).map((device) => (
          <li key={device.deviceId} className="flex items-center justify-between gap-2 text-sm">
            <span className="font-mono text-xs">{device.deviceId}</span>
            {device.verified ? (
              <span className="inline-flex items-center gap-1 text-success-700">
                <ShieldCheck aria-hidden="true" className="size-4" /> Verified
              </span>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => void start(device.deviceId)}>
                Verify
              </Button>
            )}
          </li>
        ))}
      </ul>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
