export function testUser(overrides = {}) {
  return {
    id: '64b000000000000000000001',
    username: 'ada',
    displayName: 'Ada Lovelace',
    email: 'ada@example.com',
    emailVerified: true,
    status: 'active',
    role: 'user',
    hasPassword: true,
    googleLinked: false,
    avatarUrl: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  };
}

export function testSession(user = {}, session = {}) {
  const now = Date.now();
  return {
    user: testUser(user),
    session: {
      id: '64b0000000000000000000aa',
      authMethod: 'password',
      authenticatedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 30 * 86_400_000).toISOString(),
      accessTokenExpiresAt: new Date(now + 600_000).toISOString(),
      ...session,
    },
  };
}
