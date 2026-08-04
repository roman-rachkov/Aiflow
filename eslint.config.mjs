import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';
import boundaries from 'eslint-plugin-boundaries';
import unusedImports from 'eslint-plugin-unused-imports';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/generated/**',
      '**/next-env.d.ts',
      // Config files are not part of any tsconfig, so projectService cannot
      // type them (the .mjs/.ts cases were missed originally and broke
      // `yarn lint` — see docs/15-engineering-conventions.md § 7). Routing
      // them through allowDefaultProject instead is tracked as a separate
      // task: its glob semantics differ from plain ignores and it surfaces
      // the tseslint `config()` deprecation, neither of which belongs in a
      // behaviour-preserving pass.
      '**/*.config.js',
      '**/*.config.mjs',
      '**/*.config.ts',
      'eslint.config.mjs',
      // Yarn PnP artifacts. PnP is off (see .yarnrc.yml), but a stale
      // .pnp.cjs in a working tree must not fail the gate.
      '.pnp.*',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      // A TS-aware resolver so import-plugin rules (no-cycle, etc.) and
      // eslint-plugin-boundaries resolve tsconfig `paths` aliases (@/*,
      // @aiflow/*). Without it those rules never see the resolved path for an
      // alias import and silently skip it — see A8 in
      // reports/2026-08-04-review-and-refactor-plan.md.
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: './apps/web/tsconfig.json',
        },
      },
      // FSD element classification for apps/web — docs/15 §2.1-2.2. `capture`
      // pulls the slice name out of the path so policies can distinguish
      // same-slice internal imports (allowed) from cross-slice ones (forbidden).
      'boundaries/elements': [
        { type: 'app', pattern: 'apps/web/src/app/**', partialMatch: false },
        {
          type: 'feature',
          pattern: 'apps/web/src/features/*',
          partialMatch: false,
          capture: ['slice'],
        },
        { type: 'shared', pattern: 'apps/web/src/shared/**', partialMatch: false },
      ],
    },
    plugins: {
      import: importPlugin,
      boundaries,
      'unused-imports': unusedImports,
      '@eslint-community/eslint-comments': eslintComments,
    },
    rules: {
      // Correctness — see docs/15-engineering-conventions.md § 4.2
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      'import/no-cycle': 'error',

      // FSD layer boundaries — § 2.2. Dependencies point one way:
      // app/ → features/ → shared/ → packages/. No arrow backwards, no arrow
      // sideways between slices. eslint-plugin-boundaries classifies each file
      // by element type (settings.boundaries/elements above) and enforces the
      // policies here. `capture: { slice }` on the feature element lets the
      // same-slice policy distinguish features/auth → features/auth (allowed,
      // internal) from features/auth → features/task-board (forbidden, sideways).
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            // app/ may depend on features (via barrel) and shared.
            {
              from: { element: { type: 'app' } },
              allow: { to: { element: { type: ['feature', 'shared'] } } },
            },
            // app/ routes may import their own neighbours (layouts, pages).
            { from: { element: { type: 'app' } }, allow: { to: { element: { type: 'app' } } } },
            // shared/ is the bottom of the app tree — it may import its own files.
            {
              from: { element: { type: 'shared' } },
              allow: { to: { element: { type: 'shared' } } },
            },
            // features/ may depend on shared/.
            {
              from: { element: { type: 'feature' } },
              allow: { to: { element: { type: 'shared' } } },
            },
            // A feature may import its own slice's internals, but NOT another
            // slice's — captured slice name must match the importer's.
            {
              from: { element: { type: 'feature' } },
              allow: {
                to: {
                  element: {
                    type: 'feature',
                    captured: { slice: '{{ from.element.captured.slice }}' },
                  },
                },
              },
            },
          ],
        },
      ],

      // Disable directives must carry a reason — § 3.3
      '@eslint-community/eslint-comments/require-description': ['error', { ignore: [] }],

      'unused-imports/no-unused-imports': 'error',

      // Size limits — § 3.1. Warn locally, blocking via --max-warnings 0 in CI.
      'max-lines': ['warn', { max: 200, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['warn', { max: 50, skipBlankLines: true, skipComments: true }],
      complexity: ['warn', 10],
      'max-depth': ['warn', 4],
      'max-params': ['warn', 4],
    },
  },

  // Test files get a 400-line allowance — § 3.3
  {
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/tests/**'],
    rules: {
      'max-lines': ['warn', { max: 400, skipBlankLines: true, skipComments: true }],
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },

  // Config and migration files are exempt — § 3.3
  {
    files: ['**/*.config.{ts,mjs}', '**/prisma/**', '**/scripts/**'],
    rules: {
      'max-lines': 'off',
      'import/no-internal-modules': 'off',
    },
  },

  // Must stay last — disables every rule Prettier would fight over (§ 4.1)
  prettier,
);
