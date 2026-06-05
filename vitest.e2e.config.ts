// Separate Vitest config for the Playwright-driven e2e tests under
// `tests/e2e/`. Distinct from the unit test config because:
//   • the e2e tests run against a real Vite dev server + Chromium, so
//     they must NOT use jsdom (which would replace window.localStorage
//     and break the actual SaveManager patch path).
//   • the unit-test setup (`tests/save/setup.ts`) installs a memory
//     localStorage polyfill that's irrelevant — and harmful — here.
//   • they are slow (start a Vite server, launch a browser); keeping
//     them out of `pnpm test` keeps the dev loop snappy.
//
// Run with: pnpm test:e2e

import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  define: {
    APP_VERSION: JSON.stringify('test')
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    },
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.vue']
  },
  test: {
    globals: true,
    // Node env — the test FILE itself runs in node, and uses the
    // Playwright `chromium` browser to drive the actual app.
    environment: 'node',
    include: ['tests/e2e/**/*.{test,spec}.ts'],
    // Browser launch + Vite server boot can easily exceed the default
    // 5s timeout per test on a cold cache.
    testTimeout: 90_000,
    hookTimeout: 90_000
  }
})
