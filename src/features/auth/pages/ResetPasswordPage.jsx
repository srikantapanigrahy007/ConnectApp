import { emailLinkTokenSchema, PASSWORD_MIN_LENGTH, passwordSchema } from '#shared';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { z } from 'zod';
import { Alert } from '../../../components/ui/Alert';
import { Button, ButtonLink } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { PasswordInput } from '../../../components/ui/Input';
import { ApiError } from '../../../lib/api-client';
import { clearFieldError, validateForm } from '../../../lib/form';
import { AuthHeader, authLinkClass } from '../components/AuthLayout';
import { FormError } from '../components/FormError';
import { useResetPassword } from '../hooks';

const resetFormSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string().min(1, 'Confirm your password') })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const tokenValid = emailLinkTokenSchema.safeParse(token).success;
  const [errors, setErrors] = useState({});
  const reset = useResetPassword();

  const onSubmit = (event) => {
    event.preventDefault();
    const result = validateForm(resetFormSchema, event.currentTarget);
    setErrors(result.errors);
    if (result.success) reset.mutate({ token, password: result.data.password });
  };

  const linkExpired = reset.error instanceof ApiError && reset.error.code === 'INVALID_TOKEN';

  if (!tokenValid || linkExpired) {
    return (
      <>
        <AuthHeader
          title="This link has expired"
          description="Reset links work once and expire after 30 minutes."
        />
        <ButtonLink to="/forgot-password" fullWidth>
          Request a new link
        </ButtonLink>
      </>
    );
  }

  if (reset.isSuccess) {
    return (
      <>
        <AuthHeader
          title="Password updated"
          description="You can now sign in with your new password."
        />
        <div className="space-y-5">
          <Alert tone="success" role="status">
            For your security, every device that was signed in has been signed out.
          </Alert>
          <ButtonLink to="/login" fullWidth>
            Sign in
          </ButtonLink>
        </div>
      </>
    );
  }

  return (
    <>
      <AuthHeader
        title="Choose a new password"
        description="Pick a password you don't use anywhere else."
      />
      <div className="space-y-5">
        <FormError error={reset.error instanceof ApiError ? reset.error : null} />
        <form noValidate onSubmit={onSubmit} className="space-y-4">
          <Field
            label="New password"
            error={errors.password}
            hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          >
            {(control) => (
              <PasswordInput
                {...control}
                name="password"
                autoComplete="new-password"
                onChange={() => setErrors((current) => clearFieldError(current, 'password'))}
              />
            )}
          </Field>
          <Field label="Confirm new password" error={errors.confirmPassword}>
            {(control) => (
              <PasswordInput
                {...control}
                name="confirmPassword"
                autoComplete="new-password"
                onChange={() => setErrors((current) => clearFieldError(current, 'confirmPassword'))}
              />
            )}
          </Field>
          <Button type="submit" fullWidth loading={reset.isPending}>
            Update password
          </Button>
        </form>
        <Link to="/login" className={`text-sm ${authLinkClass}`}>
          Back to sign in
        </Link>
      </div>
    </>
  );
}
