import { loginRequestSchema } from '#shared';
import { Mail } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { Input, PasswordInput } from '../../../components/ui/Input';
import { ApiError } from '../../../lib/api-client';
import { clearFieldError, validateForm } from '../../../lib/form';
import { lastSessionEndReason, signedOutMessages } from '../../../lib/session-events';
import { googleSignInUrl } from '../api';
import { AuthHeader, authLinkClass } from '../components/AuthLayout';
import { FormError } from '../components/FormError';
import { GoogleButton, OrDivider } from '../components/GoogleButton';

import { useAuthProviders, useLogin } from '../hooks';
import { safeReturnPath } from '../safe-return-path';

const oauthErrors = {
  google_failed: "We couldn't sign you in with Google. Please try again.",
  google_cancelled: 'Google sign-in was cancelled.',
  google_unavailable: 'Google sign-in is not available right now.',
  account_suspended: 'This account has been suspended.',
  account_banned: 'This account has been banned.',
  google_conflict:
    'An account with this email is already linked to a different Google account. Sign in with your password or that Google account.',
  registration_disabled: 'New registrations are paused right now.',
};

export function LoginPage() {
  const [errors, setErrors] = useState({});
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const login = useLogin();
  const providers = useAuthProviders();
  const returnTo = safeReturnPath(searchParams.get('returnTo'));
  const signedOutReason = location.state?.signedOutReason ?? lastSessionEndReason();
  const oauthError = oauthErrors[searchParams.get('error') ?? ''];

  const onSubmit = (event) => {
    event.preventDefault();
    const result = validateForm(loginRequestSchema, event.currentTarget);
    setErrors(result.errors);
    if (!result.success) return;
    login.mutate(result.data, { onSuccess: () => void navigate(returnTo, { replace: true }) });
  };

  return (
    <>
      <AuthHeader title="Sign in" description="Welcome back. Sign in to continue to your chats." />
      <div className="space-y-5">
        {signedOutReason ? (
          <Alert tone={signedOutReason === 'superseded' ? 'warning' : 'info'} role="status">
            {signedOutMessages[signedOutReason]}
          </Alert>
        ) : null}
        {oauthError ? (
          <Alert tone="danger" role="alert">
            {oauthError}
          </Alert>
        ) : null}
        <FormError error={login.error instanceof ApiError ? login.error : null} />

        {providers.data?.google ? (
          <>
            <GoogleButton
              label="Continue with Google"
              onClick={() => window.location.assign(googleSignInUrl('login', returnTo))}
            />
            <OrDivider />
          </>
        ) : null}

        <form noValidate onSubmit={onSubmit} className="space-y-4">
          <Field label="Email" error={errors.email}>
            {(control) => (
              <Input
                {...control}
                name="email"
                type="email"
                autoComplete="email"
                leadingIcon={Mail}
                onChange={() => setErrors((current) => clearFieldError(current, 'email'))}
              />
            )}
          </Field>
          <Field
            label="Password"
            error={errors.password}
            labelAction={
              <Link to="/forgot-password" className={`text-sm ${authLinkClass}`}>
                Forgot password?
              </Link>
            }
          >
            {(control) => (
              <PasswordInput
                {...control}
                name="password"
                autoComplete="current-password"
                onChange={() => setErrors((current) => clearFieldError(current, 'password'))}
              />
            )}
          </Field>
          <Button type="submit" fullWidth loading={login.isPending}>
            Sign in
          </Button>
        </form>

        <p className="text-center text-sm text-ink-muted">
          New to Connect?{' '}
          <Link to="/register" className={authLinkClass}>
            Create an account
          </Link>
        </p>
      </div>
    </>
  );
}
