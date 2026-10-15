import { lazy, Suspense } from 'react';
import { AppLayout } from '../components/layout/AppLayout';
import { PageSpinner } from '../components/ui/Spinner';
import { AuthLayout } from '../features/auth/components/AuthLayout';
import {
  RedirectIfAuthenticated,
  RequireAdmin,
  RequireAuth,
  SessionWatcher,
} from '../features/auth/components/SessionGuards';
import { ForgotPasswordPage } from '../features/auth/pages/ForgotPasswordPage';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { RegisterPage } from '../features/auth/pages/RegisterPage';
import { ResetPasswordPage } from '../features/auth/pages/ResetPasswordPage';
import { VerifyEmailPage } from '../features/auth/pages/VerifyEmailPage';
import { GroupDetailsPage } from '../features/groups/pages/GroupDetailsPage';
import { GroupsPage } from '../features/groups/pages/GroupsPage';
import { JoinGroupPage } from '../features/groups/pages/JoinGroupPage';
import { LandingPage } from '../features/landing/LandingPage';
import { ChatsIndexPage } from '../features/messaging/pages/ChatsIndexPage';
import { ConversationPage } from '../features/messaging/pages/ConversationPage';
import { MessagingLayout } from '../features/messaging/pages/MessagingLayout';
import { NotificationsPage } from '../features/notifications/pages/NotificationsPage';
import { NotificationSettingsPage } from '../features/settings/pages/NotificationSettingsPage';
import { MessageRequestsPage } from '../features/requests/pages/MessageRequestsPage';
import { SettingsLayout } from '../features/settings/components/SettingsLayout';
import { AppSettingsPage } from '../features/settings/pages/AppSettingsPage';
import { BlockedUsersPage } from '../features/settings/pages/BlockedUsersPage';
import { PrivacySettingsPage } from '../features/settings/pages/PrivacySettingsPage';
import { DiscoverPage } from '../features/users/pages/DiscoverPage';
import { ProfilePage } from '../features/users/pages/ProfilePage';
import { UserProfilePage } from '../features/users/pages/UserProfilePage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { RouteErrorPage } from './RouteErrorPage';

/** Code-splits a rarely used screen into its own chunk. */
function lazyElement(load, pick) {
  const Component = lazy(async () => ({ default: pick(await load()) }));
  return (
    <Suspense fallback={<PageSpinner />}>
      <Component />
    </Suspense>
  );
}

const adminPages = () => import('../features/admin/pages/AdminPages');

export const routes = [
  {
    path: '/',
    element: <SessionWatcher />,
    errorElement: <RouteErrorPage />,
    children: [
      // Public landing page; signed-in users go straight to their chats.
      {
        index: true,
        element: (
          <RedirectIfAuthenticated>
            <LandingPage />
          </RedirectIfAuthenticated>
        ),
      },

      // Signed-out screens
      {
        element: <AuthLayout />,
        children: [
          {
            path: 'login',
            element: (
              <RedirectIfAuthenticated>
                <LoginPage />
              </RedirectIfAuthenticated>
            ),
          },
          {
            path: 'register',
            element: (
              <RedirectIfAuthenticated>
                <RegisterPage />
              </RedirectIfAuthenticated>
            ),
          },
          // Reachable whether or not someone is signed in (they arrive from email links).
          { path: 'forgot-password', element: <ForgotPasswordPage /> },
          { path: 'reset-password', element: <ResetPasswordPage /> },
          { path: 'verify-email', element: <VerifyEmailPage /> },
        ],
      },

      // Application shell (signed in only)
      {
        element: (
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        ),
        children: [
          {
            path: 'chats',
            element: <MessagingLayout />,
            children: [
              { index: true, element: <ChatsIndexPage /> },
              { path: ':conversationId', element: <ConversationPage /> },
            ],
          },
          { path: 'discover', element: <DiscoverPage /> },
          { path: 'requests', element: <MessageRequestsPage /> },
          { path: 'groups', element: <GroupsPage /> },
          { path: 'groups/:groupId', element: <GroupDetailsPage /> },
          { path: 'join', element: <JoinGroupPage /> },
          { path: 'notifications', element: <NotificationsPage /> },
          { path: 'profile', element: <ProfilePage /> },
          { path: 'users/:username', element: <UserProfilePage /> },
          {
            path: 'settings',
            element: <SettingsLayout />,
            children: [
              { index: true, element: <AppSettingsPage /> },
              { path: 'notifications', element: <NotificationSettingsPage /> },
              { path: 'privacy', element: <PrivacySettingsPage /> },
              { path: 'blocked', element: <BlockedUsersPage /> },
            ],
          },
          // Development-only component gallery; the whole branch is removed from production builds.
          ...(import.meta.env.DEV
            ? [
                {
                  path: 'dev/ui',
                  element: lazyElement(
                    () => import('../features/dev/UiKitPage'),
                    (module) => module.UiKitPage,
                  ),
                },
              ]
            : []),
        ],
      },

      // Admin (separate shell, lazy-loaded, administrators only)
      {
        path: 'admin',
        element: (
          <RequireAdmin>
            {lazyElement(
              () => import('../features/admin/components/AdminLayout'),
              (module) => module.AdminLayout,
            )}
          </RequireAdmin>
        ),
        children: [
          { index: true, element: lazyElement(adminPages, (module) => module.AdminOverviewPage) },
          { path: 'users', element: lazyElement(adminPages, (module) => module.AdminUsersPage) },
          {
            path: 'reports',
            element: lazyElement(adminPages, (module) => module.AdminReportsPage),
          },
          { path: 'groups', element: lazyElement(adminPages, (module) => module.AdminGroupsPage) },
          { path: 'roles', element: lazyElement(adminPages, (module) => module.AdminRolesPage) },
          { path: 'audit', element: lazyElement(adminPages, (module) => module.AdminAuditPage) },
          {
            path: 'settings',
            element: lazyElement(adminPages, (module) => module.AdminSettingsPage),
          },
          { path: 'system', element: lazyElement(adminPages, (module) => module.AdminSystemPage) },
        ],
      },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
