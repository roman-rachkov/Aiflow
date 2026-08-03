import { defineConfig } from 'vitest/config';

/**
 * Root Vitest config. B4 in docs/14-decisions-needed.md resolves the framework
 * choice to Vitest; this file is what makes `yarn test` a real gate rather than
 * a Lerna no-op (see docs/17-session-review.md § 3.2).
 *
 * `passWithNoTests: false` is the load-bearing setting: a workspace with zero
 * tests must fail the gate loudly instead of exiting 0 and looking green.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: false,
    include: [
      'apps/*/src/**/*.{test,spec}.{ts,tsx}',
      'services/*/src/**/*.{test,spec}.{ts,tsx}',
      'packages/*/src/**/*.{test,spec}.{ts,tsx}',
      'tools/*/src/**/*.{test,spec}.{ts,tsx}',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/generated/**'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      exclude: ['**/node_modules/**', '**/generated/**', '**/*.config.*', '**/*.d.ts'],
    },
  },
});
