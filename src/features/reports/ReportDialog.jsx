import { createReportSchema, LIMITS, REPORT_REASONS } from '#shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Select, Textarea } from '../../components/ui/FormControls';
import { useToast } from '../../components/ui/toast-context';
import { ApiError } from '../../lib/api-client';
import { createReport } from './api';
import { REPORT_REASON_LABELS } from '../admin/labels';

const WHAT_IS_SHARED = {
  user: 'Moderators see the account and your description. No messages are shared.',
  message:
    'Moderators see this message as you can see it now, plus your description. Nothing else from the chat is shared.',
  group: 'Moderators see the group’s details and your description. No messages are shared.',
};

/**
 * Report a user, a message or a group to the moderators. Only what is listed in the dialog is
 * sent with the report.
 *
 * @param {{ open: boolean, onClose: () => void, target: { type: 'user' | 'message' | 'group', id: string, name: string } | null }} props
 */
export function ReportDialog({ open, onClose, target }) {
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [error, setError] = useState(null);
  const send = useMutation({ mutationFn: (report) => createReport(report) });

  const close = () => {
    setReason('');
    setDetails('');
    setError(null);
    onClose();
  };

  const submit = (event) => {
    event.preventDefault();
    const parsed = createReportSchema.safeParse({
      targetType: target.type,
      targetId: target.id,
      reason: reason || undefined,
      details: details.trim() || undefined,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(
        issue?.path[0] === 'reason' ? 'Choose a reason' : (issue?.message ?? 'Check the form'),
      );
      return;
    }
    setError(null);
    send.mutate(parsed.data, {
      onSuccess: () => {
        close();
        toast({ tone: 'success', title: 'Report sent. Thanks for letting us know.' });
      },
      onError: (failure) =>
        setError(
          failure instanceof ApiError ? failure.message : 'Something went wrong. Try again.',
        ),
    });
  };

  if (!target) return null;
  return (
    <Dialog
      open={open}
      onClose={close}
      size="sm"
      title={`Report ${target.name}`}
      description={WHAT_IS_SHARED[target.type]}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="report-form" variant="danger" loading={send.isPending}>
            Send report
          </Button>
        </>
      }
    >
      <form id="report-form" noValidate onSubmit={submit} className="space-y-3">
        <label className="block text-sm font-medium text-ink">
          Reason
          <Select
            className="mt-1"
            data-autofocus
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          >
            <option value="">Choose a reason…</option>
            {REPORT_REASONS.map((value) => (
              <option key={value} value={value}>
                {REPORT_REASON_LABELS[value]}
              </option>
            ))}
          </Select>
        </label>
        <label className="block text-sm font-medium text-ink">
          What happened? <span className="font-normal text-ink-muted">(optional)</span>
          <Textarea
            className="mt-1"
            rows={3}
            maxLength={LIMITS.reportDetailsMaxLength}
            value={details}
            onChange={(event) => setDetails(event.target.value)}
          />
        </label>
        {error ? (
          <p role="alert" className="text-sm text-danger-700">
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
