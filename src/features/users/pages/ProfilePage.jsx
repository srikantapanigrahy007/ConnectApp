import { LIMITS, profileUpdateSchema } from '#shared';
import { AtSign, Globe, Lock } from 'lucide-react';
import { useState } from 'react';
import { PageContainer, PageHeader } from '../../../components/layout/Page';
import { Button, ButtonLink } from '../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Field } from '../../../components/ui/Field';
import { Textarea } from '../../../components/ui/FormControls';
import { Input } from '../../../components/ui/Input';
import { PageSpinner } from '../../../components/ui/Spinner';
import { useToast } from '../../../components/ui/toast-context';
import { ApiError } from '../../../lib/api-client';
import { cn } from '../../../lib/cn';
import { clearFieldError, fieldErrorsFromApi } from '../../../lib/form';
import { FormError } from '../../auth/components/FormError';
import { AvatarEditor } from '../components/AvatarEditor';
import { useOwnProfile, useUpdateProfile } from '../hooks';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' });

const visibilityOptions = [
  {
    value: 'public',
    icon: Globe,
    title: 'Public',
    description:
      'Anyone signed in can see your bio and join date, and find you by part of your username.',
  },
  {
    value: 'private',
    icon: Lock,
    title: 'Private',
    description:
      'People you aren’t connected with see only your name, username and photo, and must search your exact username.',
  },
];

function ProfileForm({ profile }) {
  const [values, setValues] = useState({
    displayName: profile.displayName,
    username: profile.username,
    bio: profile.bio,
    profileVisibility: profile.profileVisibility,
  });
  const [errors, setErrors] = useState({});
  const update = useUpdateProfile();
  const { toast } = useToast();

  const set = (field) => (value) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => clearFieldError(current, field));
  };

  const onSubmit = (event) => {
    event.preventDefault();
    // Send only what changed.
    const changes = Object.fromEntries(
      Object.entries(values).filter(([key, value]) => value !== profile[key]),
    );
    if (Object.keys(changes).length === 0) {
      toast({ title: 'Nothing to save' });
      return;
    }
    const result = profileUpdateSchema.safeParse(changes);
    if (!result.success) {
      setErrors(
        fieldErrorsFromApi(
          result.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        ),
      );
      return;
    }
    update.mutate(result.data, {
      onSuccess: (saved) => {
        setValues({
          displayName: saved.displayName,
          username: saved.username,
          bio: saved.bio,
          profileVisibility: saved.profileVisibility,
        });
        toast({ tone: 'success', title: 'Profile saved' });
      },
      onError: (error) => {
        if (error instanceof ApiError && error.details.length > 0) {
          setErrors(fieldErrorsFromApi(error.details));
        }
      },
    });
  };

  const formError =
    update.error instanceof ApiError && update.error.details.length === 0 ? update.error : null;

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-5">
      <FormError error={formError} />
      <Field label="Name" error={errors.displayName}>
        {(control) => (
          <Input
            {...control}
            value={values.displayName}
            onChange={(event) => set('displayName')(event.target.value)}
            autoComplete="name"
            maxLength={50}
          />
        )}
      </Field>
      <Field
        label="Username"
        error={errors.username}
        hint="3–30 lowercase letters, numbers and underscores. Changing it changes your profile link."
      >
        {(control) => (
          <Input
            {...control}
            value={values.username}
            onChange={(event) => set('username')(event.target.value.toLowerCase())}
            leadingIcon={AtSign}
            autoCapitalize="none"
            spellCheck={false}
            maxLength={30}
          />
        )}
      </Field>
      <Field
        label="Bio"
        optional
        error={errors.bio}
        hint={`${values.bio.length}/${LIMITS.bioMaxLength} characters`}
      >
        {(control) => (
          <Textarea
            {...control}
            value={values.bio}
            onChange={(event) => set('bio')(event.target.value)}
            maxLength={LIMITS.bioMaxLength}
            rows={3}
          />
        )}
      </Field>

      <fieldset>
        <legend className="text-sm font-medium text-ink">Profile visibility</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {visibilityOptions.map(({ value, icon: Icon, title, description }) => {
            const checked = values.profileVisibility === value;
            return (
              <label
                key={value}
                className={cn(
                  'flex cursor-pointer gap-3 rounded-xl border p-4 text-sm',
                  checked
                    ? 'border-primary-600 bg-primary-50'
                    : 'border-border hover:bg-surface-muted',
                )}
              >
                <input
                  type="radio"
                  name="profileVisibility"
                  value={value}
                  checked={checked}
                  onChange={() => set('profileVisibility')(value)}
                  className="mt-0.5 accent-primary-600"
                />
                <span>
                  <span className="flex items-center gap-1.5 font-medium text-ink">
                    <Icon aria-hidden="true" className="size-4" />
                    {title}
                  </span>
                  <span className="mt-1 block text-ink-muted">{description}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex justify-end">
        <Button type="submit" loading={update.isPending}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

/** The signed-in user's own profile: photo, details and visibility. */
export function ProfilePage() {
  const profile = useOwnProfile();

  return (
    <PageContainer>
      <PageHeader
        title="Your profile"
        description="How other people see you on Connect."
        actions={
          profile.data ? (
            <ButtonLink to={`/users/${profile.data.username}`} variant="secondary">
              View as others see it
            </ButtonLink>
          ) : null
        }
      />
      {profile.isPending ? (
        <PageSpinner label="Loading your profile…" />
      ) : profile.isError ? (
        <ErrorState
          message={profile.error.message}
          onRetry={() => void profile.refetch()}
          isRetrying={profile.isFetching}
        />
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Profile photo"
              description={`Joined ${dateFormat.format(new Date(profile.data.joinedAt))}`}
            />
            <CardBody>
              <AvatarEditor profile={profile.data} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Profile details" />
            <CardBody>
              <ProfileForm profile={profile.data} />
            </CardBody>
          </Card>
        </div>
      )}
    </PageContainer>
  );
}
