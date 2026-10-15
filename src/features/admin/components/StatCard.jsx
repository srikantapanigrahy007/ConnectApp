import { Card } from '../../../components/ui/Card';

export function StatCard({ label, icon: Icon, value, footnote }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink-muted">{label}</p>
        <Icon aria-hidden="true" className="size-4 text-ink-subtle" />
      </div>
      {value === undefined ? (
        <p className="mt-2 text-2xl font-semibold text-ink-subtle">
          <span aria-hidden="true">—</span>
          <span className="sr-only">No data</span>
        </p>
      ) : (
        <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
      )}
      <p className="mt-1 text-xs text-ink-muted">
        {footnote ?? (value === undefined ? 'No data source yet' : '')}
      </p>
    </Card>
  );
}
