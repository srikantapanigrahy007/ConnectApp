import {
  REPORT_RESOLUTION_ACTIONS,
  REPORT_STATUSES,
  REPORT_TARGET_TYPES,
  reportDecisionSchema,
} from '#shared';
import { Flag, Paperclip } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '../../../components/layout/Page';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Select, Textarea } from '../../../components/ui/FormControls';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useToast } from '../../../components/ui/toast-context';
import { ApiError } from '../../../lib/api-client';
import { cn } from '../../../lib/cn';
import { decideReport, getReport, listReports } from '../api';
import { AdminList } from '../components/AdminList';
import { NoAccess } from '../components/NoAccess';
import { useAdminMutation, useAdminPages, useAdminQuery, useCan } from '../hooks';
import { formatDateTime, REPORT_REASON_LABELS, REPORT_STATUS, RESOLUTION_LABELS } from '../labels';

const PAGE_SIZE = 20;
const TARGET_LABELS = { user: 'User', message: 'Message', group: 'Group' };

function ReportStatusBadge({ status }) {
  const meta = REPORT_STATUS[status];
  return (
    <Badge tone={meta.tone} dot>
      {meta.label}
    </Badge>
  );
}

const targetName = (report) =>
  report.targetType === 'group'
    ? (report.targetGroupName ?? 'Removed group')
    : report.targetUser
      ? `${report.targetUser.displayName} (@${report.targetUser.username})`
      : 'Unknown user';

/** Reports queue: Pending → Reviewing → Resolved / Dismissed. */
export function AdminReportsPage() {
  const can = useCan();
  const [filters, setFilters] = useState({ status: 'open', targetType: '' });
  const [selectedId, setSelectedId] = useState(null);
  const reports = useAdminPages(
    ['reports', filters],
    (cursor) => listReports({ ...filters, cursor, limit: PAGE_SIZE }),
    { enabled: can('reports.view') },
  );

  if (!can('reports.view')) {
    return (
      <>
        <PageHeader title="Reports" documentTitle="Admin reports" />
        <NoAccess />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Reports"
        documentTitle="Admin reports"
        description="Review users, messages and groups reported by people."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <div className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row">
            <Select
              aria-label="Report status"
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({ ...current, status: event.target.value }))
              }
            >
              <option value="">All statuses</option>
              {REPORT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {REPORT_STATUS[status].label}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Reported item"
              value={filters.targetType}
              onChange={(event) =>
                setFilters((current) => ({ ...current, targetType: event.target.value }))
              }
            >
              <option value="">Users, messages and groups</option>
              {REPORT_TARGET_TYPES.map((type) => (
                <option key={type} value={type}>
                  {TARGET_LABELS[type]}s
                </option>
              ))}
            </Select>
          </div>
          <AdminList
            query={reports}
            label="Reports"
            empty={{
              icon: Flag,
              title: 'No reports here',
              description: 'Nothing matches these filters.',
            }}
            renderItem={(report) => (
              <button
                type="button"
                onClick={() => setSelectedId(report.id)}
                aria-current={selectedId === report.id ? 'true' : undefined}
                className={cn(
                  'flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-muted',
                  selectedId === report.id && 'bg-primary-50',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">
                    {TARGET_LABELS[report.targetType]}: {targetName(report)}
                  </span>
                  <span className="block truncate text-xs text-ink-muted">
                    {REPORT_REASON_LABELS[report.reason]} · {formatDateTime(report.createdAt)}
                  </span>
                </span>
                <ReportStatusBadge status={report.status} />
              </button>
            )}
          />
        </Card>
        {selectedId ? (
          <ReportDetails key={selectedId} reportId={selectedId} />
        ) : (
          <Card>
            <EmptyState
              icon={Flag}
              title="Select a report"
              description="The reporter’s details, the evidence they submitted and decisions appear here."
            />
          </Card>
        )}
      </div>
    </>
  );
}

function ReportDetails({ reportId }) {
  const can = useCan();
  const report = useAdminQuery(['report', reportId], () => getReport(reportId));

  if (report.isPending) {
    return (
      <Card className="space-y-3 p-5" role="status">
        <span className="sr-only">Loading report…</span>
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-24 w-full" />
      </Card>
    );
  }
  if (report.isError) {
    return <ErrorState message={report.error.message} onRetry={() => void report.refetch()} />;
  }
  const r = report.data;

  return (
    <Card aria-labelledby="admin-report-title">
      <div className="flex items-start gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 id="admin-report-title" className="text-base font-semibold text-ink">
            {TARGET_LABELS[r.targetType]} report: {REPORT_REASON_LABELS[r.reason]}
          </h2>
          <p className="text-sm text-ink-muted">{targetName(r)}</p>
        </div>
        <ReportStatusBadge status={r.status} />
      </div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 px-5 py-4 text-sm sm:grid-cols-2">
        {[
          ['Reported by', r.reporter ? `${r.reporter.displayName} (@${r.reporter.username})` : '—'],
          ['Reported', formatDateTime(r.createdAt)],
          ['Assigned to', r.assignedTo ? r.assignedTo.displayName : 'Nobody'],
          ['Target id', r.targetId],
        ].map(([term, detail]) => (
          <div key={term}>
            <dt className="text-xs text-ink-muted">{term}</dt>
            <dd className="break-words text-ink">{detail}</dd>
          </div>
        ))}
        <div className="sm:col-span-2">
          <dt className="text-xs text-ink-muted">Reporter’s details</dt>
          <dd className="break-words whitespace-pre-wrap text-ink">{r.details || '—'}</dd>
        </div>
      </dl>

      <section aria-labelledby="admin-report-evidence" className="border-t border-border px-5 py-4">
        <h3 id="admin-report-evidence" className="text-sm font-semibold text-ink">
          Evidence submitted by the reporter
        </h3>
        {r.evidence.length === 0 ? (
          <p className="mt-1 text-sm text-ink-muted">
            None. Reports about users and groups don’t include messages.
          </p>
        ) : (
          <ol className="mt-2 space-y-2">
            {r.evidence.map((item) => (
              <li key={item.messageId} className="rounded-lg bg-surface-muted p-3 text-sm">
                <p className="text-xs text-ink-muted">
                  {item.sender?.displayName ?? 'Unknown'} · {formatDateTime(item.sentAt)}
                </p>
                {item.text ? (
                  <p className="mt-1 break-words whitespace-pre-wrap text-ink">{item.text}</p>
                ) : null}
                {item.attachment ? (
                  <p className="mt-1 flex items-center gap-1 text-xs text-ink-muted">
                    <Paperclip aria-hidden="true" className="size-3.5" />
                    {item.attachment.name ?? 'Attachment'} ·{' '}
                    {item.attachment.contentType ?? item.attachment.kind} (file not kept in the
                    report)
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      {r.resolution ? (
        <section className="border-t border-border px-5 py-4 text-sm">
          <h3 className="font-semibold text-ink">Decision</h3>
          <p className="mt-1 text-ink">{RESOLUTION_LABELS[r.resolution.action]}</p>
          <p className="text-ink-muted">
            {r.resolution.decidedBy?.displayName ?? '—'} · {formatDateTime(r.resolution.decidedAt)}
          </p>
          {r.resolution.note ? <p className="mt-1 text-ink">“{r.resolution.note}”</p> : null}
        </section>
      ) : null}

      {can('reports.resolve') ? <DecisionForm report={r} /> : null}
    </Card>
  );
}

/** Take / release / resolve / dismiss / reopen, following the report state machine. */
export function DecisionForm({ report }) {
  const { toast } = useToast();
  const decide = useAdminMutation((decision) => decideReport(report.id, decision));
  const [mode, setMode] = useState(null);
  const [action, setAction] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const closed = report.status === 'resolved' || report.status === 'dismissed';

  const send = async (decision, done) => {
    const parsed = reportDecisionSchema.safeParse(decision);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the form');
      return;
    }
    setError(null);
    try {
      await decide.mutateAsync(parsed.data);
      setMode(null);
      setNote('');
      setAction('');
      toast({ tone: 'success', title: done });
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'Something went wrong. Try again.');
    }
  };

  return (
    <section aria-label="Decision" className="space-y-3 border-t border-border px-5 py-4">
      <div className="flex flex-wrap gap-2">
        {report.status === 'open' ? (
          <Button
            size="sm"
            variant="secondary"
            loading={decide.isPending && !mode}
            onClick={() => void send({ status: 'under_review' }, 'Report taken for review')}
          >
            Take for review
          </Button>
        ) : null}
        {report.status === 'under_review' ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void send({ status: 'open' }, 'Report back in the queue')}
          >
            Release
          </Button>
        ) : null}
        {closed ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void send({ status: 'open' }, 'Report reopened')}
          >
            Reopen
          </Button>
        ) : (
          <>
            <Button size="sm" onClick={() => setMode('resolved')}>
              Resolve
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setMode('dismissed')}>
              Dismiss
            </Button>
          </>
        )}
      </div>
      {mode ? (
        <form
          noValidate
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void send(
              mode === 'resolved'
                ? { status: mode, action: action || undefined, note }
                : { status: mode, note },
              mode === 'resolved' ? 'Report resolved' : 'Report dismissed',
            );
          }}
        >
          {mode === 'resolved' ? (
            <label className="block text-sm font-medium text-ink">
              Action taken
              <Select
                className="mt-1"
                value={action}
                onChange={(event) => setAction(event.target.value)}
              >
                <option value="">Choose…</option>
                {REPORT_RESOLUTION_ACTIONS.map((value) => (
                  <option key={value} value={value}>
                    {RESOLUTION_LABELS[value]}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}
          <label className="block text-sm font-medium text-ink">
            {mode === 'resolved' ? 'Resolution note' : 'Why dismiss it?'}
            <Textarea
              className="mt-1"
              rows={3}
              maxLength={1000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <p className="text-xs text-ink-muted">
            Recording a decision doesn’t moderate anything by itself: suspend or ban users and
            groups from their pages.
          </p>
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={decide.isPending}>
              {mode === 'resolved' ? 'Resolve report' : 'Dismiss report'}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setMode(null)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}
