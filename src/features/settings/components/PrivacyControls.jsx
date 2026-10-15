import { ErrorState } from '../../../components/ui/ErrorState';
import { Select, Switch } from '../../../components/ui/FormControls';
import { ListSkeleton } from '../../../components/ui/Skeleton';
import { useToast } from '../../../components/ui/toast-context';
import { ApiError } from '../../../lib/api-client';
import { useOwnProfile, useUpdatePrivacy, useUpdateProfile } from '../../users/hooks';
import { SettingRow, SettingsSection } from './SettingsSection';

const audienceOptions = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'connections', label: 'Connections only' },
  { value: 'nobody', label: 'Nobody' },
];

/**
 * Privacy controls. Each change is saved immediately and enforced by the API; the descriptions
 * say exactly what other people will and won't see.
 */
export function PrivacyControls() {
  const profile = useOwnProfile();
  const updatePrivacy = useUpdatePrivacy();
  const updateProfile = useUpdateProfile();
  const { toast } = useToast();

  if (profile.isPending) return <ListSkeleton rows={3} label="Loading privacy settings…" />;
  if (profile.isError) {
    return (
      <ErrorState
        message={profile.error.message}
        onRetry={() => void profile.refetch()}
        isRetrying={profile.isFetching}
      />
    );
  }

  const { privacy } = profile.data;
  const saving = updatePrivacy.isPending || updateProfile.isPending;
  const callbacks = {
    onSuccess: () => toast({ tone: 'success', title: 'Privacy setting saved' }),
    onError: (error) =>
      toast({
        tone: 'danger',
        title: "Couldn't save the setting",
        description: error instanceof ApiError ? error.message : undefined,
      }),
  };
  const setPrivacy = (key) => (value) => updatePrivacy.mutate({ [key]: value }, callbacks);

  return (
    <>
      <SettingsSection
        title="Profile and messages"
        description="Who can find you and start a conversation."
      >
        <SettingRow
          label="Profile visibility"
          description="Public profiles show your bio and join date and appear when people search part of your username. Private profiles show only your name, username and photo to people you aren't connected with, and they need your exact username to find you."
          control={({ labelId, descriptionId }) => (
            <Select
              aria-labelledby={labelId}
              aria-describedby={descriptionId}
              value={profile.data.profileVisibility}
              disabled={saving}
              onChange={(event) =>
                updateProfile.mutate({ profileVisibility: event.target.value }, callbacks)
              }
            >
              <option value="public">Public</option>
              <option value="private">Private</option>
            </Select>
          )}
        />
        <SettingRow
          label="Who can message me?"
          description="Everyone lets anyone you haven't blocked send you a request. Connections only limits messages to people you're already connected with. Nobody turns off new requests."
          control={({ labelId, descriptionId }) => (
            <Select
              aria-labelledby={labelId}
              aria-describedby={descriptionId}
              value={privacy.messagePermission}
              disabled={saving}
              onChange={(event) => setPrivacy('messagePermission')(event.target.value)}
            >
              {audienceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        />
      </SettingsSection>

      <SettingsSection
        title="Activity"
        description="What people can tell about when you're around."
      >
        <SettingRow
          label="Online status"
          description="Who sees the “Online” badge on your profile while you have Connect open."
          control={({ labelId, descriptionId }) => (
            <Select
              aria-labelledby={labelId}
              aria-describedby={descriptionId}
              value={privacy.onlineStatusVisibility}
              disabled={saving}
              onChange={(event) => setPrivacy('onlineStatusVisibility')(event.target.value)}
            >
              {audienceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        />
        <SettingRow
          label="Last seen"
          description="Who sees when you last had Connect open."
          control={({ labelId, descriptionId }) => (
            <Select
              aria-labelledby={labelId}
              aria-describedby={descriptionId}
              value={privacy.lastSeenVisibility}
              disabled={saving}
              onChange={(event) => setPrivacy('lastSeenVisibility')(event.target.value)}
            >
              {audienceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        />
        <SettingRow
          label="Read receipts"
          description="If you turn these off, people won't see when you've read their messages, and you won't see when they've read yours."
          control={({ labelId, descriptionId }) => (
            <Switch
              checked={privacy.readReceipts}
              disabled={saving}
              labelledBy={labelId}
              describedBy={descriptionId}
              onCheckedChange={setPrivacy('readReceipts')}
            />
          )}
        />
        <SettingRow
          label="Typing indicators"
          description="If you turn these off, people won't see when you're typing, and you won't see when they are."
          control={({ labelId, descriptionId }) => (
            <Switch
              checked={privacy.typingIndicators}
              disabled={saving}
              labelledBy={labelId}
              describedBy={descriptionId}
              onCheckedChange={setPrivacy('typingIndicators')}
            />
          )}
        />
      </SettingsSection>
    </>
  );
}
