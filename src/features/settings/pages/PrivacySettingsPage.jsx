import { CircleCheck } from 'lucide-react';
import { PageHeader } from '../../../components/layout/Page';
import { Badge } from '../../../components/ui/Badge';
import { PageSpinner } from '../../../components/ui/Spinner';
import {
  ChangePasswordForm,
  CurrentSessionDetails,
  DeleteAccount,
  SignOutEverywhere,
} from '../../auth/components/AccountSecurity';
import { useSession } from '../../auth/hooks';
import { PrivacyControls } from '../components/PrivacyControls';
import { SettingRow, SettingsSection } from '../components/SettingsSection';

export function PrivacySettingsPage() {
  const auth = useSession();

  return (
    <>
      <PageHeader
        title="Privacy & security"
        description="Control who can reach you and keep your account secure."
      />
      {auth.status !== 'authenticated' ? (
        <PageSpinner />
      ) : (
        <div className="space-y-6">
          <SettingsSection title="This device" description="Where you're signed in right now.">
            <div className="space-y-4 px-5 py-4">
              <CurrentSessionDetails session={auth.session} />
              <SignOutEverywhere />
            </div>
          </SettingsSection>

          <SettingsSection
            title="Password"
            description={
              auth.user.hasPassword
                ? 'Changing your password signs out every other device.'
                : 'Add a password so you can also sign in with your email.'
            }
          >
            <div className="px-5 py-4">
              <ChangePasswordForm auth={auth} />
            </div>
          </SettingsSection>

          <SettingsSection title="Google account">
            <SettingRow
              label={auth.user.googleLinked ? 'Linked' : 'Not linked'}
              description={
                auth.user.googleLinked
                  ? 'You can sign in with Google.'
                  : `To link Google, sign in with "Continue with Google" using ${auth.user.email}.`
              }
              control={() =>
                auth.user.googleLinked ? (
                  <Badge tone="success">
                    <CircleCheck aria-hidden="true" className="size-3.5" /> Linked
                  </Badge>
                ) : (
                  <Badge>Not linked</Badge>
                )
              }
            />
          </SettingsSection>

          <PrivacyControls />

          <SettingsSection
            title="Delete account"
            description="Permanently delete your account. This can't be undone."
          >
            <div className="px-5 py-4">
              <DeleteAccount auth={auth} />
            </div>
          </SettingsSection>
        </div>
      )}
    </>
  );
}
