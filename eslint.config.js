import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import { reactRefresh } from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';

export default defineConfig([
  globalIgnores(['**/dist/**', '**/coverage/**', '**/node_modules/**']),

  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      // Prefix a name with _ to mark it as intentionally unused.
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'no-console': ['warn', { allow: ['error'] }],
    },
  },

  // Tool configuration files run in Node.js.
  {
    files: ['*.config.js'],
    languageOptions: { globals: globals.node },
  },

  // E2EE test harness pages run in a browser.
  {
    files: ['e2e/*-harness.js'],
    languageOptions: { globals: globals.browser },
  },
  // Multi-page tests: Node drives Chrome (page callbacks run in the browser).
  {
    files: ['e2e/**/*.e2e.test.js', 'vitest.*.config.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },

  // React web client (JSX).
  {
    files: ['src/**/*.{js,jsx}'],
    extends: [reactHooks.configs.flat['recommended-latest'], reactRefresh.configs.vite()],
    languageOptions: {
      globals: {
        ...globals.browser,
        // Injected by Vite at build time from package.json (see vite.config.js).
        __APP_VERSION__: 'readonly',
      },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },

  // Must stay last: turns off rules that conflict with Prettier.
  prettier,
]);
