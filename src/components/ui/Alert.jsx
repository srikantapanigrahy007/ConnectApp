import { CircleAlert, CircleCheck, Construction, Info, TriangleAlert } from 'lucide-react';

import { cn } from '../../lib/cn';

const tones = {
  info: {
    box: 'border-primary-200 bg-primary-50',
    icon: Info,
    iconColor: 'text-primary-700',
    title: 'text-primary-900',
  },
  success: {
    box: 'border-success-200 bg-success-50',
    icon: CircleCheck,
    iconColor: 'text-success-700',
    title: 'text-success-700',
  },
  warning: {
    box: 'border-warning-200 bg-warning-50',
    icon: TriangleAlert,
    iconColor: 'text-warning-800',
    title: 'text-warning-800',
  },
  danger: {
    box: 'border-danger-200 bg-danger-50',
    icon: CircleAlert,
    iconColor: 'text-danger-700',
    title: 'text-danger-700',
  },
};

export function Alert({ tone = 'info', title, children, icon, action, role, className }) {
  const config = tones[tone];
  const Icon = icon ?? config.icon;
  return (
    <div
      role={role}
      className={cn('flex gap-3 rounded-xl border p-4 text-sm', config.box, className)}
    >
      <Icon aria-hidden="true" className={cn('mt-0.5 size-5 shrink-0', config.iconColor)} />
      <div className="min-w-0 flex-1">
        {title ? <p className={cn('font-semibold', config.title)}>{title}</p> : null}
        {children ? (
          <div className={cn('text-ink-muted', title && 'mt-0.5')}>{children}</div>
        ) : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </div>
  );
}

/** Standard notice for screens whose functionality has not been implemented yet. */
export function NotImplementedNotice({ title = 'Not available yet', children, className }) {
  return (
    <Alert tone="warning" icon={Construction} title={title} className={className}>
      {children}
    </Alert>
  );
}
