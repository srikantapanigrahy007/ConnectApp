import { emailLinkTokenSchema } from '#shared';
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { Alert } from '../../../components/ui/Alert';
import { ButtonLink } from '../../../components/ui/Button';
import { PageSpinner } from '../../../components/ui/Spinner';
import { AuthHeader } from '../components/AuthLayout';
import { useSession, useVerifyEmail } from '../hooks';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const tokenValid = emailLinkTokenSchema.safeParse(token).success;
  const verify = useVerifyEmail();
  const session = useSession();
  const started = useRef(false);

  useEffect(() => {
    // Tokens are single-use, so make sure StrictMode's double effect sends only one request.
    if (!tokenValid || started.current) return;
    started.current = true;
    verify.mutate(token);
  }, [token, tokenValid, verify]);

  const continueTo = session.status === 'authenticated' ? '/chats' : '/login';

  if (!tokenValid || verify.isError) {
    return (
      <>
        <AuthHeader
          title="This link can't be used"
          description="Verification links work once and expire after 24 hours."
        />
        <Alert tone="info">
          {session.status === 'authenticated'
            ? 'You can send a new link from the banner at the top of the app.'
            : 'Sign in to send yourself a new verification link.'}
        </Alert>
        <ButtonLink to={continueTo} fullWidth className="mt-5">
          {session.status === 'authenticated' ? 'Go to Connect' : 'Sign in'}
        </ButtonLink>
      </>
    );
  }

  if (verify.isSuccess) {
    return (
      <>
        <AuthHeader
          title="Email verified"
          description="Thanks for confirming your email address."
        />
        <ButtonLink to={continueTo} fullWidth>
          {session.status === 'authenticated' ? 'Continue to Connect' : 'Sign in'}
        </ButtonLink>
      </>
    );
  }

  return (
    <>
      <AuthHeader title="Verifying your email" description="This only takes a moment." />
      <PageSpinner label="Verifying…" />
    </>
  );
}
