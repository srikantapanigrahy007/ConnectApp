import { defineConfig } from 'vitest/config';

/**
 * Multi-page browser tests (files ending in .e2e.test.js under e2e/): Node drives the installed Google Chrome
 * through Playwright (literal reloads, several tabs). Files run one at a time.
 *
 *   npm run test:e2e
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['e2e/**/*.e2e.test.js'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
