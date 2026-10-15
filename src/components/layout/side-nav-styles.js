import { cn } from '../../lib/cn';

/**
 * Classes for a side-navigation row. `rail` rows collapse to a centred icon on tablet (md) and
 * show their label from desktop (lg) up; other rows always show the label.
 */
export function sideNavRowClasses(rail, isActive = false) {
  return cn(
    'flex items-center gap-3 rounded-lg p-2.5 text-sm font-medium',
    rail && 'md:justify-center lg:justify-start lg:px-3',
    isActive
      ? 'bg-primary-50 text-primary-700'
      : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
  );
}
