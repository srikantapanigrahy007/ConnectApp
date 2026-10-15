import { useState } from 'react';
import { PageHeader } from '../../../components/layout/Page';
import { Alert } from '../../../components/ui/Alert';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Switch } from '../../../components/ui/FormControls';
import { ListSkeleton } from '../../../components/ui/Skeleton';
import { useToast } from '../../../components/ui/toast-context';
import { ApiError } from '../../../lib/api-client';
import { desktopPermission, requestDesktopPermission } from '../../notifications/desktop';
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '../../notifications/hooks';
import { SettingRow, SettingsSection } from '../components/SettingsSection';

const permissionText = {
  unsupported: "This browser doesn't support desktop notifications.",
  denied:
    'Your browser is blocking notifications from Connect. Allow them in your browser’s site settings, then try again.',
};

/**
 * Notification preferences, saved to your account (they apply on every device). Muting a chat
 * (from the chat itself) also stops its message notifications.
 */
export function NotificationSettingsPage() {
  const preferences = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();
  const { toast } = useToast();
  const [permission, setPermission] = useState(desktopPermission);

  const save = (changes) =>
    update.mutate(changes, {
      onSuccess: () => toast({ tone: 'success', title: 'Notification setting saved' }),
      onError: (error) =>
        toast({
          tone: 'danger',
          title: "Couldn't save the setting",
          description: error instanceof ApiError ? error.message : undefined,
        }),
    });

  /** Turning desktop alerts on asks the browser first (this click is the user action it needs). */
  const setDesktop = async (on) => {
    if (!on) {
      save({ desktop: false });
      return;
    }
    const result = permission === 'granted' ? 'granted' : await requestDesktopPermission();
    setPermission(result);
    if (result === 'granted') save({ desktop: true });
  };

  const header = (
    <PageHeader
      title="Notifications"
      description="Choose what Connect notifies you about. These settings follow your account to every device."
    />
  );
  if (preferences.isPending) {
    return (
      <>
        {header}
        <ListSkeleton rows={4} label="Loading notification settings…" />
      </>
    );
  }
  if (preferences.isError) {
    return (
      <>
        {header}
        <ErrorState
          message={preferences.error.message}
          onRetry={() => void preferences.refetch()}
          isRetrying={preferences.isFetching}
        />
      </>
    );
  }

  const values = preferences.data;
  const saving = update.isPending;
  // A category switch reads as off (and can't change) while notifications are off.
  const category =
    (key) =>
    ({ labelId, descriptionId }) => (
      <Switch
        checked={values.enabled && values[key]}
        disabled={saving || !values.enabled}
        labelledBy={labelId}
        describedBy={descriptionId}
        onCheckedChange={(checked) => save({ [key]: checked })}
      />
    );

  return (
    <>
      {header}
      <div className="space-y-6">
        <SettingsSection title="In-app notifications">
          <SettingRow
            label="Notifications"
            description="When off, nothing new is added to your notifications. Ones you already have stay until you dismiss them."
            control={({ labelId, descriptionId }) => (
              <Switch
                checked={values.enabled}
                disabled={saving}
                labelledBy={labelId}
                describedBy={descriptionId}
                onCheckedChange={(checked) => save({ enabled: checked })}
              />
            )}
          />
          <SettingRow
            label="Messages"
            description="New messages in your chats and groups. Muted chats never notify you."
            control={category('messages')}
          />
          <SettingRow
            label="Message requests"
            description="Someone sends you a request, or accepts yours."
            control={category('requests')}
          />
          <SettingRow
            label="Groups"
            description="You're added to or removed from a group, your role changes, a group is deleted, or someone joins with your invitation."
            control={category('groups')}
          />
          <SettingRow
            label="Missed calls"
            description="A call you didn't answer. Calls still ring while Connect is open, whatever this setting."
            control={category('calls')}
          />
        </SettingsSection>

        <SettingsSection
          title="Desktop"
          description="Shown by your browser while Connect is open in a background tab. They never include message text."
        >
          <SettingRow
            label="Desktop notifications"
            description={
              permissionText[permission] ?? 'Your browser asks for permission the first time.'
            }
            control={({ labelId, descriptionId }) => (
              <Switch
                checked={values.desktop && permission === 'granted'}
                disabled={saving || permission === 'unsupported'}
                labelledBy={labelId}
                describedBy={descriptionId}
                onCheckedChange={(checked) => void setDesktop(checked)}
              />
            )}
          />
          {values.desktop && permission === 'denied' ? (
            <div className="px-5 py-4">
              <Alert tone="warning">
                Desktop notifications are on for your account, but this browser blocks them. You
                still get every notification inside Connect.
              </Alert>
            </div>
          ) : null}
        </SettingsSection>
      </div>
    </>
  );
}
