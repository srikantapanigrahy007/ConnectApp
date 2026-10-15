import { PASSWORD_MIN_LENGTH, passwordSchema } from '#shared';
import { KeyRound, LogOut, Trash } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { z } from 'zod';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Dialog } from '../../../components/ui/Dialog';
import { Field } from '../../../components/ui/Field';
import { PasswordInput, Input } from '../../../components/ui/Input';
import { useToast } from '../../../components/ui/toast-context';
import { ApiError } from '../../../lib/api-client';
import { clearFieldError, fieldErrorsFromApi, validateForm } from '../../../lib/form';
import { googleSignInUrl } from '../api';
import {
  isRecentlyAuthenticated,
  useChangePassword,
  useDeleteAccount,
  useLogoutAll,
  useReauthenticate,
} from '../hooks';
import { FormError } from './FormError';

const DELETE_RETURN_PATH = '/settings/privacy?confirm=delete';

const dateTime = (iso) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );

/** This device's session. Only one session can be active per account. */
export function CurrentSessionDetails({ session }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-ink-muted">Signed in with</dt>
        <dd className="font-medium text-ink">
          {session.authMethod === 'google' ? 'Google' : 'Email and password'}
        </dd>
      </div>
      <div>
        <dt className="text-ink-muted">Session expires</dt>
        <dd className="font-medium text-ink">{dateTime(session.expiresAt)}</dd>
      </div>
      <p className="text-ink-muted sm:col-span-2">
        Connect allows one active session per account. Signing in on another device signs this one
        out.
      </p>
    </dl>
  );
}

const changeFormSchema = z
  .object({
    currentPassword: z.string().optional(),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export function ChangePasswordForm({ auth }) {
  const { toast } = useToast();
  const change = useChangePassword();
  const [errors, setErrors] = useState({});
  const hasPassword = auth.user.hasPassword;
  const canSetPassword = hasPassword || isRecentlyAuthenticated(auth.session);

  const onSubmit = (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const result = validateForm(changeFormSchema, form);
    setErrors(result.errors);
    if (!result.success) return;
    if (hasPassword && !result.data.currentPassword) {
      setErrors({ currentPassword: 'Enter your current password' });
      return;
    }
    change.mutate(
      { currentPassword: result.data.currentPassword, newPassword: result.data.newPassword },
      {
        onSuccess: () => {
          form.reset();
          toast({
            tone: 'success',
            title: hasPassword ? 'Password changed' : 'Password set',
            description: 'Any other devices were signed out.',
          });
        },
        onError: (error) => {
          if (error instanceof ApiError && error.details.length > 0)
            setErrors(fieldErrorsFromApi(error.details));
        },
      },
    );
  };

  if (!canSetPassword) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink-muted">
          You sign in with Google. To add a password, confirm it's you with Google first.
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => window.location.assign(googleSignInUrl('reauth', '/settings/privacy'))}
        >
          Confirm with Google
        </Button>
      </div>
    );
  }

  const clear = (field) => () => setErrors((current) => clearFieldError(current, field));
  const formError =
    change.error instanceof ApiError && change.error.details.length === 0 ? change.error : null;

  return (
    <form noValidate onSubmit={onSubmit} className="max-w-md space-y-4">
      <FormError error={formError} />
      {hasPassword ? (
        <Field label="Current password" error={errors.currentPassword}>
          {(control) => (
            <PasswordInput
              {...control}
              name="currentPassword"
              autoComplete="current-password"
              onChange={clear('currentPassword')}
            />
          )}
        </Field>
      ) : null}
      <Field
        label="New password"
        error={errors.newPassword}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
      >
        {(control) => (
          <PasswordInput
            {...control}
            name="newPassword"
            autoComplete="new-password"
            onChange={clear('newPassword')}
          />
        )}
      </Field>
      <Field label="Confirm new password" error={errors.confirmPassword}>
        {(control) => (
          <PasswordInput
            {...control}
            name="confirmPassword"
            autoComplete="new-password"
            onChange={clear('confirmPassword')}
          />
        )}
      </Field>
      <Button type="submit" variant="secondary" icon={KeyRound} loading={change.isPending}>
        {hasPassword ? 'Change password' : 'Set password'}
      </Button>
    </form>
  );
}

export function SignOutEverywhere() {
  const [open, setOpen] = useState(false);
  const logoutAll = useLogoutAll();

  const confirm = () => {
    logoutAll.mutate();
  };

  return (
    <>
      <Button variant="secondary" size="sm" icon={LogOut} onClick={() => setOpen(true)}>
        Sign out of all devices
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Sign out of all devices?"
        description="Every device, including this one, will need to sign in again."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirm} loading={logoutAll.isPending}>
              Sign out everywhere
            </Button>
          </>
        }
      >
        <FormError error={logoutAll.error instanceof ApiError ? logoutAll.error : null} />
      </Dialog>
    </>
  );
}

export function DeleteAccount({ auth }) {
  const [searchParams, setSearchParams] = useSearchParams();
  // Returning from "Confirm with Google" (?confirm=delete) reopens the dialog.
  const [open, setOpen] = useState(() => searchParams.get('confirm') === 'delete');
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState();
  const reauthenticate = useReauthenticate();
  const remove = useDeleteAccount();
  const { toast } = useToast();

  const recentlyAuthenticated = isRecentlyAuthenticated(auth.session);
  const needsPassword = !recentlyAuthenticated && auth.user.hasPassword;
  const needsGoogle = !recentlyAuthenticated && !auth.user.hasPassword;
  const confirmed = confirmation.trim().toLowerCase() === auth.user.username;

  useEffect(() => {
    if (searchParams.has('confirm')) setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const close = () => {
    setOpen(false);
    setConfirmation('');
    setPassword('');
    setPasswordError(undefined);
  };

  const deleteNow = () => {
    remove.mutate(undefined, {
      onSuccess: () => toast({ tone: 'success', title: 'Your account was deleted' }),
    });
  };

  const onSubmit = (event) => {
    event.preventDefault();
    if (!confirmed) return;
    if (needsPassword) {
      if (!password) {
        setPasswordError('Enter your password');
        return;
      }
      reauthenticate.mutate(password, {
        onSuccess: deleteNow,
        onError: () => setPasswordError('That password is incorrect'),
      });
      return;
    }
    deleteNow();
  };

  const error =
    (remove.error instanceof ApiError ? remove.error : null) ??
    (reauthenticate.error instanceof ApiError && reauthenticate.error.code !== 'INVALID_CREDENTIALS'
      ? reauthenticate.error
      : null);

  return (
    <>
      <Button variant="danger" size="sm" icon={Trash} onClick={() => setOpen(true)}>
        Delete account
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title="Delete your account?"
        description="Your profile is removed and you're signed out everywhere. This can't be undone."
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            {needsGoogle ? (
              <Button
                onClick={() =>
                  window.location.assign(googleSignInUrl('reauth', DELETE_RETURN_PATH))
                }
              >
                Confirm with Google
              </Button>
            ) : (
              <Button
                type="submit"
                form="delete-account-form"
                variant="danger"
                disabled={!confirmed}
                loading={reauthenticate.isPending || remove.isPending}
              >
                Delete account
              </Button>
            )}
          </>
        }
      >
        <form id="delete-account-form" noValidate onSubmit={onSubmit} className="space-y-4">
          <FormError error={error} />
          {needsGoogle ? (
            <Alert tone="info">
              For your security, confirm it's you with Google before deleting your account.
            </Alert>
          ) : (
            <>
              <Field label={`Type your username (${auth.user.username}) to confirm`}>
                {(control) => (
                  <Input
                    {...control}
                    data-autofocus
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                )}
              </Field>
              {needsPassword ? (
                <Field
                  label="Password"
                  error={passwordError}
                  hint="Required because you signed in more than 5 minutes ago."
                >
                  {(control) => (
                    <PasswordInput
                      {...control}
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setPasswordError(undefined);
                      }}
                      autoComplete="current-password"
                    />
                  )}
                </Field>
              ) : null}
            </>
          )}
        </form>
      </Dialog>
    </>
  );
}
