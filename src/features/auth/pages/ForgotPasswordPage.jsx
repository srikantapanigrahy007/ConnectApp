import { forgotPasswordRequestSchema } from '#shared';
import { ArrowLeft, Mail } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { Input } from '../../../components/ui/Input';
import { ApiError } from '../../../lib/api-client';
import { clearFieldError, validateForm } from '../../../lib/form';
import { AuthHeader, authLinkClass } from '../components/AuthLayout';
import { FormError } from '../components/FormError';
import { useRequestPasswordReset } from '../hooks';

export function ForgotPasswordPage() {
  const [errors, setErrors] = useState({});
  const request = useRequestPasswordReset();

  const onSubmit = (event) => {
    event.preventDefault();
    const result = validateForm(forgotPasswordRequestSchema, event.currentTarget);
    setErrors(result.errors);
    if (result.success) request.mutate(result.data.email);
  };

  return (
    <>
      <AuthHeader
        title="Reset your password"
        description="Enter the email you signed up with and we'll send you a link to reset your password."
      />
      <div className="space-y-5">
        {/* The server sends the same confirmation whether or not the account exists. */}
        {request.isSuccess ? (
          <Alert tone="success" role="status" title="Check your email">
            {request.data} The link expires in 30 minutes.
          </Alert>
        ) : null}
        <FormError error={request.error instanceof ApiError ? request.error : null} />

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
          <Button type="submit" fullWidth loading={request.isPending}>
            {request.isSuccess ? 'Send another link' : 'Send reset link'}
          </Button>
        </form>

        <Link to="/login" className={`inline-flex items-center gap-1.5 text-sm ${authLinkClass}`}>
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to sign in
        </Link>
      </div>
    </>
  );
}
