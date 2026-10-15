import { configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api-client';
import { testSession } from '../../test/auth-fixtures';
import { renderRoute, renderWithProviders } from '../../test/render';
import * as authApi from '../auth/api';
import { getPublicSettings } from '../platform/api';
import { ReportDialog } from '../reports/ReportDialog';
import * as reportsApi from '../reports/api';
import * as adminApi from './api';

configure({ asyncUtilTimeout: 4_000 });

vi.mock('../auth/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getSession: vi.fn(),
  getProviders: vi.fn(() => Promise.resolve({ google: false })),
  reauthenticate: vi.fn(),
}));
vi.mock('./api', () => ({
  getDashboard: vi.fn(() => new Promise(() => undefined)),
  getSystem: vi.fn(() => new Promise(() => undefined)),
  listUsers: vi.fn(),
  getUser: vi.fn(),
  moderateUser: vi.fn(),
  revokeSessions: vi.fn(),
  listGroups: vi.fn(),
  getGroup: vi.fn(),
  moderateGroup: vi.fn(),
  listReports: vi.fn(),
  getReport: vi.fn(),
  decideReport: vi.fn(),
  listAdmins: vi.fn(),
  changeRole: vi.fn(),
  listAudit: vi.fn(),
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
}));
vi.mock('../reports/api', () => ({ createReport: vi.fn() }));

const api = vi.mocked(adminApi);
const signInAs = (role) => vi.mocked(authApi.getSession).mockResolvedValue(testSession({ role }));
const page = (items) => ({ items, meta: { limit: 20, hasMore: false, nextCursor: null } });

const grace = {
  id: '64b000000000000000000002',
  username: 'grace',
  displayName: 'Grace Hopper',
  email: 'grace@example.com',
  emailVerified: true,
  avatarUrl: null,
  status: 'active',
  role: 'user',
  createdAt: '2026-10-01T10:00:00.000Z',
  lastLoginAt: null,
  lastSeenAt: null,
};
const graceDetails = (overrides = {}) => ({
  ...grace,
  activeSessions: 2,
  online: false,
  history: [],
  ...overrides,
});

async function openGrace() {
  const user = userEvent.setup();
  api.listUsers.mockResolvedValue(page([grace]));
  api.getUser.mockResolvedValue(graceDetails());
  renderRoute('/admin/users');
  await user.click(await screen.findByRole('button', { name: /Grace Hopper/ }));
  await screen.findByRole('heading', { level: 2, name: 'Grace Hopper' });
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('admin permissions in the UI', () => {
  it('shows a Moderator only the sections their role allows', async () => {
    signInAs('moderator');
    api.listUsers.mockResolvedValue(page([]));
    renderRoute('/admin/users');
    const nav = (await screen.findAllByRole('navigation', { name: 'Admin' }))[0];
    const links = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent);
    expect(links).toEqual(['Overview', 'Users', 'Groups', 'Reports', 'System']);
    expect(await screen.findByText('Moderator')).toBeInTheDocument();
  });

  it('tells a Support Admin when a section is outside their role and never loads it', async () => {
    signInAs('support');
    renderRoute('/admin/settings');
    expect(
      await screen.findByRole('heading', { name: "Your admin role doesn't include this" }),
    ).toBeInTheDocument();
    expect(api.getSettings).not.toHaveBeenCalled();
  });

  it('lets a Support Admin force a logout but not suspend or ban', async () => {
    signInAs('support');
    await openGrace();
    expect(screen.getByRole('button', { name: 'Force logout' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suspend' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ban' })).not.toBeInTheDocument();
  });

  it('gives the legacy "admin" role the Super Admin sections', async () => {
    signInAs('admin');
    api.listUsers.mockResolvedValue(page([]));
    renderRoute('/admin/users');
    const nav = (await screen.findAllByRole('navigation', { name: 'Admin' }))[0];
    expect(within(nav).getByRole('link', { name: 'Settings' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Audit log' })).toBeInTheDocument();
  });
});

describe('user moderation', () => {
  it('requires a reason before suspending', async () => {
    signInAs('super_admin');
    const user = await openGrace();
    api.moderateUser.mockResolvedValue(graceDetails({ status: 'suspended' }));

    await user.click(screen.getByRole('button', { name: 'Suspend' }));
    const dialog = screen.getByRole('dialog', { name: 'Suspend this account?' });
    await user.click(within(dialog).getByRole('button', { name: 'Suspend' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Give a reason');
    expect(api.moderateUser).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText(/Reason/), 'Spamming strangers');
    await user.click(within(dialog).getByRole('button', { name: 'Suspend' }));
    await waitFor(() =>
      expect(api.moderateUser).toHaveBeenCalledWith(grace.id, 'suspend', 'Spamming strangers'),
    );
  });

  it('shows the server refusal (last Super Admin) instead of closing', async () => {
    signInAs('super_admin');
    const user = await openGrace();
    api.moderateUser.mockRejectedValue(
      new ApiError('LAST_SUPER_ADMIN', 'This is the last active Super Admin.', 409),
    );
    await user.click(screen.getByRole('button', { name: 'Ban' }));
    const dialog = screen.getByRole('dialog', { name: 'Ban this account?' });
    await user.type(within(dialog).getByLabelText(/Reason/), 'Testing the rule');
    await user.click(within(dialog).getByRole('button', { name: 'Ban' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'This is the last active Super Admin.',
    );
  });

  it('asks for the password when the API wants a recent sign-in, then retries', async () => {
    signInAs('super_admin');
    const user = await openGrace();
    api.moderateUser
      .mockRejectedValueOnce(
        new ApiError('REAUTHENTICATION_REQUIRED', 'Please confirm it’s you to continue.', 403),
      )
      .mockResolvedValueOnce(graceDetails({ status: 'banned' }));
    vi.mocked(authApi.reauthenticate).mockResolvedValue(testSession({ role: 'super_admin' }));

    await user.click(screen.getByRole('button', { name: 'Ban' }));
    const dialog = screen.getByRole('dialog', { name: 'Ban this account?' });
    await user.type(within(dialog).getByLabelText(/Reason/), 'Repeated harassment');
    await user.click(within(dialog).getByRole('button', { name: 'Ban' }));
    await user.type(await within(dialog).findByLabelText('Your password'), 'correct horse');
    await user.click(within(dialog).getByRole('button', { name: 'Ban' }));

    await waitFor(() => expect(api.moderateUser).toHaveBeenCalledTimes(2));
    expect(authApi.reauthenticate).toHaveBeenCalledWith('correct horse');
    expect(api.moderateUser).toHaveBeenLastCalledWith(grace.id, 'ban', 'Repeated harassment');
  });
});

describe('reports', () => {
  const report = {
    id: '64b0000000000000000000a1',
    targetType: 'message',
    targetId: '64b0000000000000000000b1',
    targetUser: { id: grace.id, username: 'grace', displayName: 'Grace Hopper', avatarUrl: null },
    targetGroupName: null,
    reporter: { id: '64b000000000000000000003', username: 'alan', displayName: 'Alan Turing' },
    reason: 'harassment',
    details: 'Kept insulting me',
    status: 'open',
    assignedTo: null,
    resolution: null,
    evidenceCount: 1,
    createdAt: '2026-10-10T10:00:00.000Z',
    updatedAt: '2026-10-10T10:00:00.000Z',
  };

  it('shows the submitted evidence and requires an action to resolve', async () => {
    signInAs('moderator');
    const user = userEvent.setup();
    api.listReports.mockResolvedValue(page([report]));
    api.getReport.mockResolvedValue({
      ...report,
      evidence: [
        {
          messageId: report.targetId,
          sender: report.targetUser,
          sentAt: '2026-10-10T09:59:00.000Z',
          type: 'text',
          text: 'You are hopeless',
          attachment: null,
        },
      ],
    });
    api.decideReport.mockResolvedValue({ ...report, status: 'resolved' });
    renderRoute('/admin/reports');

    await user.click(await screen.findByRole('button', { name: /Message: Grace Hopper/ }));
    expect(await screen.findByText('You are hopeless')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Resolve' }));
    await user.type(screen.getByLabelText('Resolution note'), 'Warned the sender');
    await user.click(screen.getByRole('button', { name: 'Resolve report' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose the action taken');
    expect(api.decideReport).not.toHaveBeenCalled();

    await user.selectOptions(screen.getByLabelText('Action taken'), 'warning');
    await user.click(screen.getByRole('button', { name: 'Resolve report' }));
    await waitFor(() =>
      expect(api.decideReport).toHaveBeenCalledWith(report.id, {
        status: 'resolved',
        action: 'warning',
        note: 'Warned the sender',
      }),
    );
  });

  it('hides decisions from Support Admins', async () => {
    signInAs('support');
    renderRoute('/admin/reports');
    expect(
      await screen.findByRole('heading', { name: "Your admin role doesn't include this" }),
    ).toBeInTheDocument();
    expect(api.listReports).not.toHaveBeenCalled();
  });
});

describe('platform settings', () => {
  const saved = {
    registrationEnabled: true,
    uploadMaxBytes: 5 * 1024 * 1024,
    groupMaxMembers: 256,
    maintenanceBanner: { enabled: false, message: '' },
  };

  it('saves only the changed settings, with a reason', async () => {
    signInAs('super_admin');
    const user = userEvent.setup();
    api.getSettings.mockResolvedValue(saved);
    api.updateSettings.mockResolvedValue({ ...saved, uploadMaxBytes: 1024 * 1024 });
    renderRoute('/admin/settings');

    const upload = await screen.findByLabelText('Maximum upload size (KB)');
    await user.clear(upload);
    await user.type(upload, '1024');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    const dialog = screen.getByRole('dialog', { name: 'Save these settings?' });
    await user.type(within(dialog).getByLabelText(/Reason/), 'Storage is nearly full');
    await user.click(within(dialog).getByRole('button', { name: 'Save settings' }));

    await waitFor(() =>
      expect(api.updateSettings).toHaveBeenCalledWith({
        uploadMaxBytes: 1024 * 1024,
        reason: 'Storage is nearly full',
      }),
    );
  });

  it('refuses out-of-range values before asking for a reason', async () => {
    signInAs('super_admin');
    const user = userEvent.setup();
    api.getSettings.mockResolvedValue(saved);
    renderRoute('/admin/settings');

    const members = await screen.findByLabelText('Maximum group members');
    await user.clear(members);
    await user.type(members, '1');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(members).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows the maintenance banner and the closed-registration notice to visitors', async () => {
    vi.mocked(authApi.getSession).mockResolvedValue(null);
    vi.mocked(getPublicSettings).mockResolvedValue({
      ...saved,
      registrationEnabled: false,
      maintenanceBanner: { enabled: true, message: 'Maintenance tonight at 22:00' },
    });
    renderRoute('/register');
    expect(await screen.findByText('Maintenance tonight at 22:00')).toBeInTheDocument();
    expect(await screen.findByText('Registration is closed')).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  });
});

describe('reporting (any user)', () => {
  it('requires a reason and sends only the target, reason and details', async () => {
    const user = userEvent.setup();
    vi.mocked(reportsApi.createReport).mockResolvedValue({ id: 'r1', status: 'open' });
    renderWithProviders(
      <ReportDialog
        open
        onClose={() => undefined}
        target={{ type: 'user', id: grace.id, name: '@grace' }}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Report @grace' });
    await user.click(within(dialog).getByRole('button', { name: 'Send report' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Choose a reason');
    expect(reportsApi.createReport).not.toHaveBeenCalled();

    await user.selectOptions(within(dialog).getByLabelText('Reason'), 'spam');
    await user.type(within(dialog).getByLabelText(/What happened/), 'Sends links all day');
    await user.click(within(dialog).getByRole('button', { name: 'Send report' }));
    await waitFor(() =>
      expect(reportsApi.createReport).toHaveBeenCalledWith({
        targetType: 'user',
        targetId: grace.id,
        reason: 'spam',
        details: 'Sends links all day',
      }),
    );
  });
});
