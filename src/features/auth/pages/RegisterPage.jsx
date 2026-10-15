import { PASSWORD_MIN_LENGTH, registerRequestSchema } from '#shared';
import { AtSign, Mail } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { Input, PasswordInput } from '../../../components/ui/Input';
import { ApiError } from '../../../lib/api-client';
import { clearFieldError, fieldErrorsFromApi, validateForm } from '../../../lib/form';
import { googleSignInUrl } from '../api';
import { AuthHeader, authLinkClass } from '../components/AuthLayout';
import { FormError } from '../components/FormError';
import { GoogleButton, OrDivider } from '../components/GoogleButton';
import { usePublicSettings } from '../../platform/hooks';
import { useAuthProviders, useRegister } from '../hooks';

// Password confirmation is a client-only concern; the API contract is registerRequestSchema.
const registerFormSchema = registerRequestSchema
  .extend({ confirmPassword: z.string().min(1, 'Confirm your password') })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export function RegisterPage() {
  const [errors, setErrors] = useState({});
  const navigate = useNavigate();
  const register = useRegister();
  const providers = useAuthProviders();
  const settings = usePublicSettings();

  const onSubmit = (event) => {
    event.preventDefault();
    const result = validateForm(registerFormSchema, event.currentTarget);
    setErrors(result.errors);
    if (!result.success) return;
    const { confirmPassword: _confirm, ...input } = result.data;
    register.mutate(input, {
      onSuccess: () => void navigate('/chats', { replace: true }),
      onError: (error) => {
        // Conflicts and validation problems are shown next to the fields they belong to.
        if (error instanceof ApiError && error.details.length > 0) {
          setErrors(fieldErrorsFromApi(error.details));
        }
      },
    });
  };

  const clear = (field) => () => setErrors((current) => clearFieldError(current, field));
  const formError =
    register.error instanceof ApiError && register.error.details.length === 0
      ? register.error
      : null;

  // The API refuses sign-ups too; this only explains it up front.
  if (settings.data?.registrationEnabled === false) {
    return (
      <>
        <AuthHeader title="Create your account" description="Join Connect to start chatting." />
        <Alert tone="info" title="Registration is closed">
          New accounts can’t be created right now. Please try again later.
        </Alert>
        <p className="mt-6 text-center text-sm text-ink-muted">
          Already have an account?{' '}
          <Link to="/login" className={authLinkClass}>
            Sign in
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <AuthHeader title="Create your account" description="Join Connect to start chatting." />
      <div className="space-y-5">
        <FormError error={formError} />

        {providers.data?.google ? (
          <>
            <GoogleButton
              label="Sign up with Google"
              onClick={() => window.location.assign(googleSignInUrl('login', '/chats'))}
            />
            <OrDivider />
          </>
        ) : null}

        <form noValidate onSubmit={onSubmit} className="space-y-4">
          <Field label="Name" error={errors.displayName}>
            {(control) => (
              <Input
                {...control}
                name="displayName"
                autoComplete="name"
                onChange={clear('displayName')}
              />
            )}
          </Field>
          <Field
            label="Username"
            error={errors.username}
            hint="3–30 characters: lowercase letters, numbers and underscores. People can find you by it."
          >
            {(control) => (
              <Input
                {...control}
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                leadingIcon={AtSign}
                onChange={clear('username')}
              />
            )}
          </Field>
          <Field label="Email" error={errors.email}>
            {(control) => (
              <Input
                {...control}
                name="email"
                type="email"
                autoComplete="email"
                leadingIcon={Mail}
                onChange={clear('email')}
              />
            )}
          </Field>
          <Field
            label="Password"
            error={errors.password}
            hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          >
            {(control) => (
              <PasswordInput
                {...control}
                name="password"
                autoComplete="new-password"
                onChange={clear('password')}
              />
            )}
          </Field>
          <Field label="Confirm password" error={errors.confirmPassword}>
            {(control) => (
              <PasswordInput
                {...control}
                name="confirmPassword"
                autoComplete="new-password"
                onChange={clear('confirmPassword')}
              />
            )}
          </Field>
          <Button type="submit" fullWidth loading={register.isPending}>
            Create account
          </Button>
        </form>

        <p className="text-center text-sm text-ink-muted">
          Already have an account?{' '}
          <Link to="/login" className={authLinkClass}>
            Sign in
          </Link>
        </p>
      </div>
    </>
  );
}
