import { ADMIN_AUDIT_ACTIONS } from '#shared';
import { ScrollText } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '../../../components/layout/Page';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Select } from '../../../components/ui/FormControls';
import { Input } from '../../../components/ui/Input';
import { listAudit } from '../api';
import { AdminList } from '../components/AdminList';
import { AuditEntry } from '../components/AuditEntry';
import { NoAccess } from '../components/NoAccess';
import { useAdminPages, useCan } from '../hooks';
import { AUDIT_ACTION_LABELS } from '../labels';

const PAGE_SIZE = 30;
const OBJECT_ID = /^[a-f\d]{24}$/i;

/** The append-only audit log, newest first. */
export function AdminAuditPage() {
  const can = useCan();
  const [filters, setFilters] = useState({ action: '', actorId: '', targetId: '' });
  const [draft, setDraft] = useState({ actorId: '', targetId: '' });
  const [error, setError] = useState(null);
  const audit = useAdminPages(
    ['audit', filters],
    (cursor) => listAudit({ ...filters, cursor, limit: PAGE_SIZE }),
    { enabled: can('audit.view') },
  );

  if (!can('audit.view')) {
    return (
      <>
        <PageHeader title="Audit log" documentTitle="Admin audit log" />
        <NoAccess />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Audit log"
        documentTitle="Admin audit log"
        description="Every administrative action, who did it and why. Entries can’t be edited or deleted."
      />
      <Card>
        <form
          className="grid gap-2 border-b border-border p-4 sm:grid-cols-[1fr_1fr_1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            const invalid = [draft.actorId, draft.targetId].some(
              (id) => id.trim() && !OBJECT_ID.test(id.trim()),
            );
            if (invalid) {
              setError('An ID is 24 characters long and uses only 0–9 and a–f.');
              return;
            }
            setError(null);
            setFilters((current) => ({
              ...current,
              actorId: draft.actorId.trim(),
              targetId: draft.targetId.trim(),
            }));
          }}
        >
          <Select
            aria-label="Action"
            value={filters.action}
            onChange={(event) =>
              setFilters((current) => ({ ...current, action: event.target.value }))
            }
          >
            <option value="">All actions</option>
            {ADMIN_AUDIT_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {AUDIT_ACTION_LABELS[action] ?? action}
              </option>
            ))}
          </Select>
          <Input
            aria-label="Admin id"
            placeholder="Admin id"
            value={draft.actorId}
            onChange={(event) =>
              setDraft((current) => ({ ...current, actorId: event.target.value }))
            }
          />
          <Input
            aria-label="Target id"
            placeholder="Target id"
            value={draft.targetId}
            onChange={(event) =>
              setDraft((current) => ({ ...current, targetId: event.target.value }))
            }
          />
          <Button type="submit" variant="secondary">
            Filter
          </Button>
          {error ? (
            <p role="alert" className="text-sm text-danger-700 sm:col-span-4">
              {error}
            </p>
          ) : null}
        </form>
        <AdminList
          query={audit}
          label="Audit entries"
          empty={{
            icon: ScrollText,
            title: 'No audit entries',
            description: 'Administrative actions appear here as they happen.',
          }}
          renderItem={(entry) => <AuditEntry entry={entry} showTarget />}
        />
      </Card>
    </>
  );
}
