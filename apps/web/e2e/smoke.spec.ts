import { test, expect } from '@playwright/test';

/**
 * Smoke test: verifies the app is up and serves HTTP responses.
 * Requires a running server at BASE_URL (default http://localhost:3000).
 * Run: BASE_URL=http://localhost:3000 yarn test:e2e
 */
test('home page responds without server error', async ({ page }) => {
  const response = await page.goto('/');
  // Any 2xx or 3xx is acceptable — we just verify the server is up
  const status = response?.status() ?? 500;
  expect(status).toBeLessThan(500);
});

test('login page returns an HTML document', async ({ page }) => {
  const response = await page.goto('/login');
  const contentType = response?.headers()['content-type'] ?? '';
  expect(contentType).toContain('text/html');
});
