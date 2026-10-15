import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api-client';
import { fetchHealth } from './health.api';
import { HealthStatusCard } from './HealthStatusCard';

// UI-state tests only: the network layer is stubbed. Real API behaviour is covered by
// the API integration tests in backend/test.
vi.mock('./health.api', () => ({ fetchHealth: vi.fn() }));
const fetchHealthMock = vi.mocked(fetchHealth);

function healthFixture(overrides = {}) {
  return {
    status: 'ok',
    service: 'connect-api',
    version: '0.1.0',
    environment: 'development',
    uptimeSeconds: 3_725,
    timestamp: '2026-10-13T10:00:00.000Z',
    checks: { database: 'connected' },
    ...overrides,
  };
}

function renderCard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <HealthStatusCard />
    </QueryClientProvider>,
  );
}

describe('HealthStatusCard', () => {
  beforeEach(() => {
    fetchHealthMock.mockReset();
  });

  it('shows a loading skeleton while the first request is pending', () => {
    fetchHealthMock.mockReturnValue(new Promise(() => undefined));
    renderCard();

    expect(screen.getByRole('status')).toHaveTextContent('Checking system status');
  });

  it('renders API and database status once loaded', async () => {
    fetchHealthMock.mockResolvedValue(healthFixture());
    renderCard();

    expect(await screen.findByText('Online')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('0.1.0')).toBeInTheDocument();
    expect(screen.getByText('1h 2m')).toBeInTheDocument();
  });

  it('flags a disconnected database', async () => {
    fetchHealthMock.mockResolvedValue(
      healthFixture({ status: 'degraded', checks: { database: 'disconnected' } }),
    );
    renderCard();

    expect(await screen.findByText('Disconnected')).toBeInTheDocument();
  });

  it('shows an error state and recovers on retry', async () => {
    fetchHealthMock.mockRejectedValueOnce(
      new ApiError('NETWORK_ERROR', 'Unable to reach the server. Check your connection.'),
    );
    fetchHealthMock.mockResolvedValueOnce(healthFixture());
    renderCard();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Unable to reach the server');

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Online')).toBeInTheDocument();
  });
});
