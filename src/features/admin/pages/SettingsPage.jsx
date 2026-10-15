import { PLATFORM_SETTING_BOUNDS, platformSettingsSchema } from '#shared';
import { useState } from 'react';
import { PageHeader } from '../../../components/layout/Page';
import { Button } from '../../../components/ui/Button';
import { Card, CardHeader } from '../../../components/ui/Card';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Field } from '../../../components/ui/Field';
import { Switch, Textarea } from '../../../components/ui/FormControls';
import { Input } from '../../../components/ui/Input';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useToast } from '../../../components/ui/toast-context';
import { getSettings, updateSettings } from '../api';
import { NoAccess } from '../components/NoAccess';
import { ReasonDialog } from '../components/ReasonDialog';
import { useAdminMutation, useAdminQuery, useCan } from '../hooks';

const KB = 1024;
const { uploadMaxBytes, groupMaxMembers, maintenanceMessageMaxLength } = PLATFORM_SETTING_BOUNDS;

/** Platform settings (Super Admins). Every change needs a reason and a recent sign-in. */
export function AdminSettingsPage() {
  const can = useCan();
  const settings = useAdminQuery(['settings'], getSettings, { enabled: can('settings.manage') });

  return (
    <>
      <PageHeader
        title="Settings"
        documentTitle="Admin settings"
        description="Platform-wide settings. Changes take effect within about 10 seconds."
      />
      {!can('settings.manage') ? (
        <NoAccess />
      ) : settings.isPending ? (
        <Card className="space-y-3 p-5" role="status">
          <span className="sr-only">Loading settings…</span>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </Card>
      ) : settings.isError ? (
        <ErrorState message={settings.error.message} onRetry={() => void settings.refetch()} />
      ) : (
        <SettingsForm key={JSON.stringify(settings.data)} saved={settings.data} />
      )}
    </>
  );
}

const toForm = (s) => ({
  registrationEnabled: s.registrationEnabled,
  uploadMaxKb: String(Math.round(s.uploadMaxBytes / KB)),
  groupMaxMembers: String(s.groupMaxMembers),
  bannerEnabled: s.maintenanceBanner.enabled,
  bannerMessage: s.maintenanceBanner.message,
});

/** Only the settings that differ from the saved ones. */
function changesOf(form, saved) {
  const next = {
    registrationEnabled: form.registrationEnabled,
    uploadMaxBytes: Number(form.uploadMaxKb) * KB,
    groupMaxMembers: Number(form.groupMaxMembers),
    maintenanceBanner: { enabled: form.bannerEnabled, message: form.bannerMessage.trim() },
  };
  return Object.fromEntries(
    Object.entries(next).filter(
      ([key, value]) => JSON.stringify(value) !== JSON.stringify(saved[key]),
    ),
  );
}

export function SettingsForm({ saved }) {
  const { toast } = useToast();
  const [form, setForm] = useState(() => toForm(saved));
  const [errors, setErrors] = useState({});
  const [confirming, setConfirming] = useState(false);
  const save = useAdminMutation((changes) => updateSettings(changes));
  const changes = changesOf(form, saved);
  const dirty = Object.keys(changes).length > 0;
  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));

  const review = (event) => {
    event.preventDefault();
    const parsed = platformSettingsSchema.partial().safeParse(changes);
    const next = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) next[issue.path[0]] = issue.message;
    }
    if (form.bannerEnabled && !form.bannerMessage.trim()) {
      next.maintenanceBanner = 'Write the banner message';
    }
    setErrors(next);
    if (Object.keys(next).length === 0 && dirty) setConfirming(true);
  };

  return (
    <>
      <form noValidate onSubmit={review} className="space-y-6">
        <Card>
          <CardHeader title="Accounts" />
          <div className="flex items-start justify-between gap-4 px-5 py-4">
            <div>
              <p id="setting-registration" className="text-sm font-medium text-ink">
                New registrations
              </p>
              <p id="setting-registration-hint" className="text-sm text-ink-muted">
                When off, nobody can create an account (email or Google). Existing users can still
                sign in.
              </p>
            </div>
            <Switch
              checked={form.registrationEnabled}
              onCheckedChange={set('registrationEnabled')}
              labelledBy="setting-registration"
              describedBy="setting-registration-hint"
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Limits" />
          <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
            <Field
              label="Maximum upload size (KB)"
              hint={`${uploadMaxBytes.min / KB}–${uploadMaxBytes.max / KB} KB. Applies to new uploads.`}
              error={errors.uploadMaxBytes}
            >
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  inputMode="numeric"
                  min={uploadMaxBytes.min / KB}
                  max={uploadMaxBytes.max / KB}
                  value={form.uploadMaxKb}
                  onChange={(event) => set('uploadMaxKb')(event.target.value)}
                />
              )}
            </Field>
            <Field
              label="Maximum group members"
              hint={`${groupMaxMembers.min}–${groupMaxMembers.max}. Existing larger groups keep their members but can’t grow.`}
              error={errors.groupMaxMembers}
            >
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  inputMode="numeric"
                  min={groupMaxMembers.min}
                  max={groupMaxMembers.max}
                  value={form.groupMaxMembers}
                  onChange={(event) => set('groupMaxMembers')(event.target.value)}
                />
              )}
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Maintenance banner" />
          <div className="space-y-4 px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <p id="setting-banner" className="text-sm font-medium text-ink">
                Show a banner to everyone
              </p>
              <Switch
                checked={form.bannerEnabled}
                onCheckedChange={set('bannerEnabled')}
                labelledBy="setting-banner"
              />
            </div>
            <Field
              label="Banner message"
              hint={`At most ${maintenanceMessageMaxLength} characters.`}
              error={errors.maintenanceBanner}
            >
              {(props) => (
                <Textarea
                  {...props}
                  rows={2}
                  maxLength={maintenanceMessageMaxLength}
                  value={form.bannerMessage}
                  onChange={(event) => set('bannerMessage')(event.target.value)}
                />
              )}
            </Field>
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={!dirty} onClick={() => setForm(toForm(saved))}>
            Discard changes
          </Button>
          <Button type="submit" disabled={!dirty}>
            Save settings
          </Button>
        </div>
      </form>

      <ReasonDialog
        open={confirming}
        title="Save these settings?"
        description="They apply to everyone. The change is recorded in the audit log."
        confirmLabel="Save settings"
        tone="primary"
        onClose={() => setConfirming(false)}
        onConfirm={async (reason) => {
          await save.mutateAsync({ ...changes, reason });
          toast({ tone: 'success', title: 'Settings saved' });
        }}
      />
    </>
  );
}
