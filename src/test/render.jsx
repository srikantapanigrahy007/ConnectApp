import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';

import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '../app/routes';
import { ToastProvider } from '../components/ui/ToastProvider';

function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/** Renders the real route tree at `path`, with the same providers as the app. */
export function renderRoute(path) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const result = render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...result, router };
}

/** Renders a single element inside a router and the app providers. */
export function renderWithProviders(element) {
  const router = createMemoryRouter([{ path: '*', element }]);
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}
