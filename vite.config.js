import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  // Server-side only (no VITE_ prefix), so these are never bundled into client code.
  const env = loadEnv(mode, import.meta.dirname, '');
  const apiProxyTarget = env.API_PROXY_TARGET || 'http://localhost:4000';
  const port = Number(env.WEB_PORT || 5173);
  const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

  // Same-origin proxy: the browser talks only to the Vite origin, which keeps future
  // session cookies first-party in development.
  const proxy = {
    '/api': { target: apiProxyTarget },
    '/socket.io': { target: apiProxyTarget, ws: true },
  };

  return {
    plugins: [react(), tailwindcss()],
    define: { __APP_VERSION__: JSON.stringify(version) },
    server: { port, strictPort: true, proxy },
    preview: { port: 4173, strictPort: true, proxy },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.js'],
      include: ['src/**/*.test.{js,jsx}'],
      // Real-browser tests run separately (vitest.browser.config.js, `npm run test:browser`).
      exclude: [...configDefaults.exclude, 'src/**/*.browser.test.js'],
      css: false,
      // Multi-step UI flows (typing, uploads, dialogs) can exceed Vitest's 5 s default when all
      // files run in parallel under jsdom.
      testTimeout: 15_000,
    },
  };
});
