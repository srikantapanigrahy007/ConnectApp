import { ArrowLeft } from 'lucide-react';

import { Link } from 'react-router';
import { usePageTitle } from '../../hooks/use-page-title';
import { cn } from '../../lib/cn';

const widths = { md: 'max-w-3xl', lg: 'max-w-5xl', xl: 'max-w-6xl' };

export function PageContainer({ width = 'md', className, children }) {
  return (
    <div className={cn('mx-auto w-full px-4 py-6 sm:px-6 lg:py-8', widths[width], className)}>
      {children}
    </div>
  );
}

/** Page heading (the page's single h1) and document title. */
export function PageHeader({ title, description, actions, backTo, documentTitle }) {
  usePageTitle(documentTitle ?? title);
  return (
    <header className="mb-6">
      {backTo ? (
        <Link
          to={backTo.to}
          className="mb-3 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-ink-muted hover:text-ink"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {backTo.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          {description ? (
            <p className="mt-1 max-w-prose text-sm text-ink-muted">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
