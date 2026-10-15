import { useId } from 'react';
import { NotImplementedBadge } from '../../../components/ui/Badge';
import { Card, CardHeader } from '../../../components/ui/Card';

export function SettingsSection({ title, description, children }) {
  const titleId = useId();
  return (
    <Card aria-labelledby={titleId}>
      <CardHeader titleId={titleId} title={title} description={description} />
      <div className="divide-y divide-border">{children}</div>
    </Card>
  );
}

/** One setting: label + description on the left, control on the right (stacked on mobile). */
export function SettingRow({ label, description, control, notImplemented = false }) {
  const labelId = useId();
  const descriptionId = useId();
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p id={labelId} className="text-sm font-medium text-ink">
            {label}
          </p>
          {notImplemented ? <NotImplementedBadge /> : null}
        </div>
        {description ? (
          <p id={descriptionId} className="mt-0.5 text-sm text-ink-muted">
            {description}
          </p>
        ) : null}
      </div>
      <div className="shrink-0">
        {control({ labelId, descriptionId: description ? descriptionId : undefined })}
      </div>
    </div>
  );
}
