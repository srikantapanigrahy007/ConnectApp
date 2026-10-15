import { RefreshCw } from 'lucide-react';
import { useId } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { ErrorState } from '../../components/ui/ErrorState';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatUptime } from './format';
import { useHealth } from './use-health';

const databaseDisplay = {
  connected: { tone: 'success', label: 'Connected' },
  connecting: { tone: 'warning', label: 'Connecting' },
  disconnecting: { tone: 'warning', label: 'Disconnecting' },
  disconnected: { tone: 'danger', label: 'Disconnected' },
};

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="text-right text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

function HealthSkeleton() {
  return (
    <div role="status" aria-live="polite" className="divide-y divide-border">
      <span className="sr-only">Checking system status…</span>
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="flex items-center justify-between py-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-20" />
        </div>
      ))}
    </div>
  );
}

export function HealthStatusCard() {
  const titleId = useId();
  const { data, error, isPending, isError, isFetching, refetch } = useHealth();
  const retry = () => void refetch();

  let content;
  if (isPending) {
    content = <HealthSkeleton />;
  } else if (isError) {
    content = (
      <ErrorState
        title="API unreachable"
        message={error.message}
        onRetry={retry}
        isRetrying={isFetching}
      />
    );
  } else {
    const database = databaseDisplay[data.checks.database];
    content = (
      <dl className="divide-y divide-border">
        <Row label="API">
          <Badge tone="success" dot>
            Online
          </Badge>
        </Row>
        <Row label="Database">
          <Badge tone={database.tone} dot>
            {database.label}
          </Badge>
        </Row>
        <Row label="Version">{data.version}</Row>
        <Row label="Environment">{data.environment}</Row>
        <Row label="Uptime">{formatUptime(data.uptimeSeconds)}</Row>
        <Row label="Last checked">
          <time dateTime={data.timestamp}>{new Date(data.timestamp).toLocaleTimeString()}</time>
        </Row>
      </dl>
    );
  }

  return (
    <Card aria-labelledby={titleId}>
      <CardHeader
        titleId={titleId}
        title="System status"
        description="Live check of the Connect API and database."
        action={
          <Button
            variant="ghost"
            size="sm"
            icon={RefreshCw}
            onClick={retry}
            loading={isFetching}
            aria-label="Refresh system status"
          >
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        }
      />
      <CardBody className="py-2">{content}</CardBody>
    </Card>
  );
}
