import { Bell, Copy } from 'lucide-react';
import { PageHeader } from '../../../components/layout/Page';
import { Button, ButtonLink } from '../../../components/ui/Button';
import { Select, Switch } from '../../../components/ui/FormControls';
import { useToast } from '../../../components/ui/toast-context';
import { HealthStatusCard } from '../../health/HealthStatusCard';
import { useHealth } from '../../health/use-health';
import { SettingRow, SettingsSection } from '../components/SettingsSection';

function CopyDiagnosticsButton() {
  const { toast } = useToast();
  const { data, error } = useHealth();

  const copy = async () => {
    const lines = [
      `Connect web ${__APP_VERSION__}`,
      data
        ? `API ${data.version} (${data.environment}), database ${data.checks.database}`
        : `API unreachable${error ? `: ${error.message}` : ''}`,
      `User agent: ${navigator.userAgent}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      toast({
        tone: 'success',
        title: 'Diagnostics copied',
        description: 'Paste them into your bug report.',
      });
    } catch {
      toast({
        tone: 'danger',
        title: "Couldn't copy diagnostics",
        description: 'Your browser blocked clipboard access.',
      });
    }
  };

  return (
    <Button variant="secondary" size="sm" icon={Copy} onClick={() => void copy()}>
      Copy diagnostics
    </Button>
  );
}

export function AppSettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Appearance, notifications and chat preferences. Options marked “Not available yet” are coming later."
      />
      <div className="space-y-6">
        <SettingsSection title="Appearance">
          <SettingRow
            label="Theme"
            description="Dark mode isn’t available yet."
            notImplemented
            control={({ labelId, descriptionId }) => (
              <Select
                aria-labelledby={labelId}
                aria-describedby={descriptionId}
                disabled
                defaultValue="light"
              >
                <option value="light">Light</option>
                <option value="system">Match system</option>
                <option value="dark">Dark</option>
              </Select>
            )}
          />
          <SettingRow
            label="Language"
            notImplemented
            control={({ labelId }) => (
              <Select aria-labelledby={labelId} disabled defaultValue="en">
                <option value="en">English</option>
              </Select>
            )}
          />
        </SettingsSection>

        <SettingsSection title="Notifications">
          <SettingRow
            label="Notification preferences"
            description="Messages, message requests, groups and desktop notifications."
            control={() => (
              <ButtonLink variant="secondary" size="sm" icon={Bell} to="/settings/notifications">
                Manage
              </ButtonLink>
            )}
          />
          <SettingRow
            label="Sounds"
            description="Play a sound for new messages."
            notImplemented
            control={({ labelId, descriptionId }) => (
              <Switch checked={false} disabled labelledBy={labelId} describedBy={descriptionId} />
            )}
          />
        </SettingsSection>

        <SettingsSection title="Chats">
          <SettingRow
            label="Press Enter to send"
            description="When off, Enter adds a new line and Ctrl+Enter sends."
            notImplemented
            control={({ labelId, descriptionId }) => (
              <Switch checked disabled labelledBy={labelId} describedBy={descriptionId} />
            )}
          />
        </SettingsSection>

        <SettingsSection title="About" description="Version and live service status.">
          <SettingRow
            label="Web app version"
            control={() => <span className="text-sm font-medium text-ink">{__APP_VERSION__}</span>}
          />
          <SettingRow
            label="Diagnostics"
            description="Copies version and status details to your clipboard."
            control={() => <CopyDiagnosticsButton />}
          />
        </SettingsSection>

        <HealthStatusCard />
      </div>
    </>
  );
}
