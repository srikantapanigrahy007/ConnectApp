import { Activity, Database, Radio, Server } from 'lucide-react';
import { PageHeader } from '../../../components/layout/Page';
import { Badge } from '../../../components/ui/Badge';
import { Card, CardHeader } from '../../../components/ui/Card';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { getSystem } from '../api';
import { NoAccess } from '../components/NoAccess';
import { useAdminQuery, useCan } from '../hooks';

const statusBadge = (status) => (
  <Badge tone={status === 'ok' ? 'success' : 'danger'} dot>
    {status === 'ok' ? 'Operational' : 'Unavailable'}
  </Badge>
);

/** API, database and Socket.IO status plus request metrics (this API instance, last 5 min). */
export function SystemHealth() {
  const system = useAdminQuery(['system'], getSystem, { refetchInterval: 30_000 });
  if (system.isPending) {
    return (
      <Card className="p-5" role="status">
        <span className="sr-only">Loading system status…</span>
        <Skeleton className="h-24 w-full" />
      </Card>
    );
  }
  if (system.isError) {
    return <ErrorState message={system.error.message} onRetry={() => void system.refetch()} />;
  }
  const s = system.data;
  const rows = [
    {
      icon: Server,
      label: 'API',
      status: s.api.status,
      detail: `v${s.api.version} · ${s.api.environment} · up ${Math.round(s.api.uptimeSeconds / 60)} min`,
    },
    {
      icon: Database,
      label: 'MongoDB',
      status: s.database.status,
      detail: s.database.latencyMs !== null ? `${s.database.latencyMs} ms ping` : 'No response',
    },
    {
      icon: Radio,
      label: 'Socket.IO',
      status: s.realtime.status,
      detail: `${s.realtime.connectedSockets ?? 0} connections · ${s.realtime.onlineUsers} people online`,
    },
    {
      icon: Activity,
      label: 'Requests (last 5 min)',
      status: s.requests.serverErrors > 0 ? 'degraded' : 'ok',
      detail: `${s.requests.requests} requests · ${s.requests.serverErrors} server errors · ${s.requests.clientErrors} client errors · p95 ${s.requests.p95Ms ?? '—'} ms`,
    },
  ];
  return (
    <Card>
      <CardHeader title="System health" description="Measured by this API instance." />
      <ul className="divide-y divide-border" aria-label="Services">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-3 px-5 py-3">
            <row.icon aria-hidden="true" className="size-5 text-ink-subtle" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-ink">{row.label}</span>
              <span className="block text-xs text-ink-muted">{row.detail}</span>
            </span>
            {row.status === 'degraded' ? (
              <Badge tone="warning" dot>
                Errors
              </Badge>
            ) : (
              statusBadge(row.status)
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function AdminSystemPage() {
  const can = useCan();
  return (
    <>
      <PageHeader
        title="System"
        documentTitle="Admin system"
        description="Service health and request metrics."
      />
      {can('system.view') ? <SystemHealth /> : <NoAccess />}
    </>
  );
}
