import {
  Activity,
  Flag,
  HardDrive,
  MessageCircle,
  UserPlus,
  Users,
  UsersRound,
} from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '../../../components/layout/Page';
import { Select } from '../../../components/ui/FormControls';
import { ErrorState } from '../../../components/ui/ErrorState';
import { formatFileSize } from '../../messaging/view-models';
import { getDashboard } from '../api';
import { NoAccess } from '../components/NoAccess';
import { StatCard } from '../components/StatCard';
import { useAdminQuery, useCan } from '../hooks';
import { SystemHealth } from './SystemPage';

const PERIODS = [
  { value: 1, label: 'Last 24 hours' },
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
];
const number = new Intl.NumberFormat();

/** Real platform metrics from the API (no sample data). */
export function AdminOverviewPage() {
  const can = useCan();
  const [days, setDays] = useState(7);
  const dashboard = useAdminQuery(['dashboard', days], () => getDashboard(days), {
    enabled: can('dashboard.view'),
  });
  const d = dashboard.data;
  const value = (v) =>
    dashboard.isPending ? undefined : v === undefined ? undefined : number.format(v);

  return (
    <>
      <PageHeader
        title="Overview"
        documentTitle="Admin overview"
        description="Key platform metrics and service health."
        actions={
          <label className="text-sm text-ink-muted">
            <span className="sr-only">Period</span>
            <Select value={days} onChange={(event) => setDays(Number(event.target.value))}>
              {PERIODS.map((period) => (
                <option key={period.value} value={period.value}>
                  {period.label}
                </option>
              ))}
            </Select>
          </label>
        }
      />
      {!can('dashboard.view') ? (
        <NoAccess />
      ) : dashboard.isError ? (
        <ErrorState message={dashboard.error.message} onRetry={() => void dashboard.refetch()} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Registered users"
            icon={Users}
            value={value(d?.users.total)}
            footnote="All accounts except deleted ones"
          />
          <StatCard
            label="New registrations"
            icon={UserPlus}
            value={value(d?.users.new)}
            footnote="Accounts created in the period"
          />
          <StatCard
            label="Active users"
            icon={Activity}
            value={value(d?.users.active)}
            footnote={d ? `Used the app in the period · ${d.users.onlineNow} online now` : ''}
          />
          <StatCard
            label="Pending reports"
            icon={Flag}
            value={value(d?.reports.pending)}
            footnote="Pending or in review"
          />
          <StatCard
            label="Conversations"
            icon={MessageCircle}
            value={value(d?.conversations.direct)}
            footnote="One-to-one chats"
          />
          <StatCard
            label="Groups"
            icon={UsersRound}
            value={value(d?.conversations.groups)}
            footnote="Not deleted"
          />
          <StatCard
            label="Messages"
            icon={MessageCircle}
            value={value(d?.messages.total)}
            footnote={d ? `${number.format(d.messages.inPeriod)} in the period` : ''}
          />
          <StatCard
            label="Attachment storage"
            icon={HardDrive}
            value={d ? formatFileSize(d.storage.usedBytes) : undefined}
            footnote={
              d ? `of ${formatFileSize(d.storage.quotaBytes)} · ${d.storage.driver} driver` : ''
            }
          />
        </div>
      )}
      {can('system.view') ? (
        <div className="mt-6">
          <SystemHealth />
        </div>
      ) : null}
    </>
  );
}
