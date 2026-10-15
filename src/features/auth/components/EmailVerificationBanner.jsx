import { MailWarning } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/toast-context';
import { ApiError } from '../../../lib/api-client';
import { useResendVerification, useSession } from '../hooks';

/** Shown until the account's email address is verified. */
export function EmailVerificationBanner() {
  const session = useSession();
  const resend = useResendVerification();
  const { toast } = useToast();
  if (session.status !== 'authenticated' || session.user.emailVerified) return null;

  const onResend = () => {
    resend.mutate(undefined, {
      onSuccess: () =>
        toast({
          tone: 'success',
          title: 'Verification email sent',
          description: `Check ${session.user.email}.`,
        }),
      onError: (error) =>
        toast({
          tone: 'danger',
          title: "Couldn't send the email",
          description: error instanceof ApiError ? error.message : undefined,
        }),
    });
  };

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-warning-200 bg-warning-50 px-4 py-2.5 text-sm sm:px-6"
    >
      <MailWarning aria-hidden="true" className="size-4 shrink-0 text-warning-800" />
      <p className="min-w-0 flex-1 text-warning-800">
        Verify your email address. We sent a link to <strong>{session.user.email}</strong>.
      </p>
      <Button variant="secondary" size="sm" onClick={onResend} loading={resend.isPending}>
        Resend email
      </Button>
    </div>
  );
}
