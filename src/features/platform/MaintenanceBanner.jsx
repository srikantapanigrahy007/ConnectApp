import { Megaphone } from 'lucide-react';
import { usePublicSettings } from './hooks';

/** The maintenance banner set by a Super Admin (Admin → Settings), shown on every screen. */
export function MaintenanceBanner() {
  const settings = usePublicSettings();
  const banner = settings.data?.maintenanceBanner;
  if (!banner?.enabled || !banner.message) return null;
  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-warning-200 bg-warning-50 px-4 py-2 text-sm text-warning-800"
    >
      <Megaphone aria-hidden="true" className="size-4 shrink-0" />
      <p className="min-w-0 break-words">{banner.message}</p>
    </div>
  );
}
