import { defineConfig, devices } from '@playwright/test';

/**
 * Minimal Playwright config for AI Studio web app smoke tests.
 * Requires a running dev server (docker compose up, or yarn dev).
 * Override base URL: BASE_URL=http://... yarn test:e2e
 *
 * Intentionally not wired into the vitest gate — E2E runs on demand,
 * not in CI, until a persistent test environment is set up (MVP-2).
 * See docs/13-agent-tooling.md § 2.3.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env['BASE_URL'] ?? 'http://localhost:3000',
    headless: true,
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
