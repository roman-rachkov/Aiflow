import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';
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
    plugins: {
      import: importPlugin,
      'unused-imports': unusedImports,
      '@eslint-community/eslint-comments': eslintComments,
    },
    rules: {
      // Correctness — see docs/15-engineering-conventions.md § 4.2
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      'import/no-cycle': 'error',

      // Slice boundaries — § 2.2. The rule blocks deep imports into a feature slice's internals
      // (e.g. `@/features/auth/model/config`); the barrel `@/features/auth` is allowed because it
      // resolves to an `index.ts`, not a submodule. The previous allow list contained `'*/**'`,
      // which under minimatch matches virtually every path and silently disabled the rule — see
      // reports/2026-08-04-review-and-refactor-plan.md A1. `allow` now whitelists only the
      // legitimate node_modules subpaths the codebase uses, plus our generated Prisma clients.
      'import/no-internal-modules': [
        'error',
        {
          allow: ['next/**', 'next-auth/**', '@auth/**', '@aiflow/*', '**/generated/**'],
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

  // app/ is routing only — it may not reach into feature internals (§ 2.2)
  {
    files: ['apps/web/src/app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/features/*/*'],
              message:
                'Import a feature through its index.ts public surface, not a deep path (docs/15-engineering-conventions.md § 2.2).',
            },
          ],
        },
      ],
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
