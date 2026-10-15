import { APP_NAME } from '#shared';
import { MessageCircle } from 'lucide-react';
import { cn } from '../../lib/cn';

export function BrandMark({ showName = true, size = 'md', className }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span
        className={cn(
          'flex items-center justify-center rounded-lg bg-primary-600 text-white',
          size === 'lg' ? 'size-10' : 'size-8',
        )}
      >
        <MessageCircle aria-hidden="true" className={size === 'lg' ? 'size-6' : 'size-5'} />
      </span>
      {showName ? (
        <span
          className={cn(
            'font-semibold tracking-tight text-ink',
            size === 'lg' ? 'text-xl' : 'text-base',
          )}
        >
          {APP_NAME}
        </span>
      ) : (
        <span className="sr-only">{APP_NAME}</span>
      )}
    </span>
  );
}
