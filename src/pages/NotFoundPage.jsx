import { MapPinOff } from 'lucide-react';
import { ButtonLink } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { usePageTitle } from '../hooks/use-page-title';

export function NotFoundPage() {
  usePageTitle('Page not found');
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center bg-canvas p-4">
      <div>
        <h1 className="sr-only">Page not found</h1>
        <EmptyState
          icon={MapPinOff}
          headingLevel={2}
          title="We couldn't find that page"
          description="The link may be broken, or the page may have moved."
          action={<ButtonLink to="/">Go to Connect</ButtonLink>}
        />
      </div>
    </main>
  );
}
