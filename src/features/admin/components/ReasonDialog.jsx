import { moderationReasonSchema } from '#shared';
import { useState } from 'react';
import { useLocation } from 'react-router';
import { Button } from '../../../components/ui/Button';
import { Dialog } from '../../../components/ui/Dialog';
import { Textarea } from '../../../components/ui/FormControls';
import { PasswordInput } from '../../../components/ui/Input';
import { ApiError } from '../../../lib/api-client';
import { googleSignInUrl } from '../../auth/api';
import { useReauthenticate, useSession } from '../../auth/hooks';

/**
 * Confirmation for an admin action that needs a reason (kept in the audit log). Shows the
 * server's refusal (e.g. last Super Admin) instead of closing. When the server asks for a recent
 * sign-in, the admin confirms their password (or Google) and the action is retried.
 */
export function ReasonDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = 'danger',
  children,
  onConfirm,
  onClose,
}) {
  const session = useSession();
  const location = useLocation();
  const reauthenticate = useReauthenticate();
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [needsReauth, setNeedsReauth] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setReason('');
    setPassword('');
    setNeedsReauth(false);
    setError(null);
    onClose();
  };

  const submit = async (event) => {
    event.preventDefault();
    const parsed = moderationReasonSchema.safeParse(reason);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Give a reason');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (needsReauth) {
        if (!password) throw new Error('Enter your password to continue.');
        await reauthenticate.mutateAsync(password);
        setNeedsReauth(false);
        setPassword('');
      }
      await onConfirm(parsed.data);
      close();
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'REAUTHENTICATION_REQUIRED') {
        setNeedsReauth(true);
        setError('Confirm it’s you to continue.');
      } else {
        setError(
          failure instanceof Error && failure.message
            ? failure.message
            : 'Something went wrong. Try again.',
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const hasPassword = session.user?.hasPassword;

  return (
    <Dialog
      open={open}
      onClose={close}
      size="sm"
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="admin-reason-form" variant={tone} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form id="admin-reason-form" noValidate onSubmit={submit} className="space-y-3">
        {children}
        <label className="block text-sm font-medium text-ink">
          Reason (kept in the audit log)
          <Textarea
            className="mt-1"
            rows={3}
            maxLength={500}
            data-autofocus
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        {needsReauth && hasPassword ? (
          <label className="block text-sm font-medium text-ink">
            Your password
            <PasswordInput
              className="mt-1"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
        ) : null}
        {needsReauth && !hasPassword ? (
          <Button
            variant="secondary"
            onClick={() => window.location.assign(googleSignInUrl('reauth', location.pathname))}
          >
            Confirm with Google
          </Button>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-danger-700">
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
