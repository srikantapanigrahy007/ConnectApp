import { UserRound } from 'lucide-react';
import { useState } from 'react';
import { apiUrl } from '../../config/env';
import { cn } from '../../lib/cn';
import { getInitials } from '../../lib/initials';

const sizes = {
  xs: { box: 'size-6', text: 'text-[0.625rem]', dot: 'size-2' },
  sm: { box: 'size-8', text: 'text-xs', dot: 'size-2.5' },
  md: { box: 'size-10', text: 'text-sm', dot: 'size-3' },
  lg: { box: 'size-14', text: 'text-lg', dot: 'size-3.5' },
  xl: { box: 'size-24', text: 'text-3xl', dot: 'size-5' },
};

export function Avatar({ name, src, size = 'md', presence, decorative = false, className }) {
  const [imageFailed, setImageFailed] = useState(false);
  const config = sizes[size];
  const initials = name ? getInitials(name) : '';
  const showImage = Boolean(src) && !imageFailed;

  return (
    <span
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : (name ?? 'Unknown user')}
      aria-hidden={decorative || undefined}
      className={cn('relative inline-flex shrink-0', config.box, className)}
    >
      {showImage ? (
        <img
          // The API returns avatars as paths ("/api/v1/avatars/…"); serve them from the API's
          // origin, which differs from the web app's when they are deployed separately.
          // Local previews (blob:/data: URLs) are used as they are.
          src={src.startsWith('/') ? apiUrl(src) : src}
          alt=""
          onError={() => setImageFailed(true)}
          className="size-full rounded-full object-cover"
        />
      ) : (
        <span
          className={cn(
            'flex size-full items-center justify-center rounded-full bg-primary-100 font-semibold text-primary-800',
            config.text,
          )}
        >
          {initials || <UserRound aria-hidden="true" className="size-1/2" />}
        </span>
      )}
      {presence ? (
        <span
          className={cn(
            'absolute right-0 bottom-0 rounded-full ring-2 ring-surface',
            config.dot,
            presence === 'online' ? 'bg-success-500' : 'bg-border-strong',
          )}
        >
          <span className="sr-only">{presence === 'online' ? 'Online' : 'Offline'}</span>
        </span>
      ) : null}
    </span>
  );
}
