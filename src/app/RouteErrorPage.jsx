import { isRouteErrorResponse, useRouteError } from 'react-router';
import { ButtonLink } from '../components/ui/Button';
import { ErrorState } from '../components/ui/ErrorState';
import { usePageTitle } from '../hooks/use-page-title';

/** Rendered when a route throws while rendering or loading. Never shows stack traces. */
export function RouteErrorPage() {
  const error = useRouteError();
  usePageTitle('Something went wrong');
  const message = isRouteErrorResponse(error)
    ? `This page couldn't load (error ${error.status}). Try again in a moment.`
    : 'Something stopped this page from loading. Reloading usually fixes it.';

  if (import.meta.env.DEV) console.error(error);

  return (
    <main id="main" className="flex min-h-dvh items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-md space-y-4">
        <h1 className="text-xl font-semibold text-ink">Something went wrong</h1>
        <ErrorState
          title="This page couldn't be displayed"
          message={message}
          onRetry={() => window.location.reload()}
        />
        <ButtonLink to="/" variant="secondary">
          Go to Connect
        </ButtonLink>
      </div>
    </main>
  );
}
