import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/**
 * Real-browser tests (`*.browser.test.js`): run in the installed Google Chrome through
 * Playwright, so WebAssembly, IndexedDB, Web Crypto and Web Locks are the browser's own, not
 * jsdom or mocks. Nothing is downloaded: `channel: 'chrome'` uses the system browser.
 *
 *   npm run test:browser
 */
export default defineConfig({
  test: {
    include: ['src/**/*.browser.test.js'],
    testTimeout: 60_000,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({ launchOptions: { channel: 'chrome' } }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
