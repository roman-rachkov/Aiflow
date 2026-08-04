# Review & Refactor Plan — 2026-08-04

Source: full read-only audit of the real codebase (`apps/web`, `packages/db`,
`packages/ui`, `tools/session-analyzer`, root configs) on 2026-08-04. Every finding below
was verified first-hand against the source, not inferred. Working branch: `refactoring`.

This is a **plan document**, not the work itself. We execute it iteratively — a few items per
pass, `yarn verify` green before each commit, Conventional Commits with workspace scope. Three
streams split by _kind of change_ because the repo conventions forbid mixing
behaviour-preserving refactor with bug-fixes and schema migrations (`docs/15`).

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `(skip)` deferred with a reason.

## Progress (2026-08-04)

**Streams A and B are complete.** 10 commits on `refactoring`, all `yarn verify` green:

| Commit  | Item     | Summary                                                        |
| ------- | -------- | -------------------------------------------------------------- |
| d35fc46 | A1       | Re-enable FSD slice-boundary rule (remove `'*/**'`)            |
| a0af71a | A2       | Restore full `@aiflow/*` path map in web tsconfig              |
| 3fae72d | A3+A5+A7 | `danger-hover` token, `--since 7d` default, fix Docker note    |
| 212157b | A4       | session-analyzer ENOENT guard + error boundary                 |
| a52be6a | A6\*     | Document why config-ignore narrowing is deferred               |
| 4a23bdb | B1       | Stop logging the seeded password                               |
| fb22c1f | B3       | `JWT.uiMode` optional + BASIC default                          |
| 50c5a26 | B4       | Spinner English default + fixed `aria-hidden` logic            |
| fecc8a9 | B2       | `forwardRef` on all UI primitives                              |
| 4835053 | B5       | `Field` `htmlFor`/`aria-describedby` wiring via `cloneElement` |

**Remaining:** A6 (deferred — needs tseslint `config()`→`defineConfig()` migration), A8 (new —
full cross-slice FSD enforcement), Stream C (schema — needs product decisions in C1).

---

## Stream A — `chore/refactor-*` (behaviour-preserving)

Goal: no observable runtime change. One or more `chore/refactor-*` PRs.

### A1 — Re-enable the FSD boundary rule _(High)_ ✅ done (d35fc46)

- **Where:** `eslint.config.mjs:53-58`
- **Problem:** the `import/no-internal-modules` `allow` list ends with `'*/**'`, which under
  minimatch matches virtually every path. The rule that `docs/15 §2.2` calls load-bearing is
  effectively disabled.
- **Plan:**
  - [x] Remove `'*/**'`.
  - [x] Replaced the broad list with a tight allow of the legitimate node_modules subpaths in
        use (`next/**`, `next-auth/**`, `@auth/**`, `@aiflow/*`, `**/generated/**`).
- **Verify:** `yarn lint` green; empirically confirmed deep `@/features/auth/model/config`
  imports from `app/` are now blocked. **Caveat found during work:** the rule cannot enforce
  cross-slice isolation (a slice importing another slice's internals via the `@/` alias)
  without a TS-aware resolver — see A8.

### A2 — Restore the full `@aiflow/*` path map in web tsconfig _(Medium)_ ✅ done (a0af71a)

- **Where:** `tsconfig.base.json:16-22`, `apps/web/tsconfig.json:10-14`
- **Problem:** `apps/web` overrides `paths` (TS does not merge) and keeps only `db` + `ui`,
  dropping `queue`/`crypto`/`ai-roles`. Latent: the first `@aiflow/crypto` import in `web` fails
  to resolve with no obvious cause.
- **Plan:**
  - [x] A shared `tsconfig.paths.json` was tested but TS does **not** merge `paths` across
        `extends` (verified empirically), so the array-extends indirection does not help. Chose
        the simpler fix: repeat all five `@aiflow/*` aliases in `apps/web/tsconfig.json` and
        document they must stay in sync with the base.
- **Verify:** `yarn typecheck` green.

### A3 — Add a `danger-hover` token _(Medium, visual-identical)_ ✅ done (3fae72d)

- **Where:** `packages/ui/src/styles/theme.css`, `packages/ui/src/Button.tsx:18`
- **Problem:** `hover:bg-red-700` is a raw palette colour, breaking the "tokens are the single
  source of truth" mandate; there is no `--color-danger-hover` (unlike `primary`/`primary-hover`).
- **Plan:**
  - [x] Add `--color-danger-hover: #b91c1c;` to `theme.css`.
  - [x] Replace `hover:bg-red-700` → `hover:bg-danger-hover` in `Button.tsx`.
- **Verify:** `#b91c1c` ≈ red-700 (visual parity); `yarn verify` green.

### A4 — Harden `session-analyzer` against missing input _(Low)_ ✅ done (212157b)

- **Where:** `tools/session-analyzer/src/cli.ts`, `transcript.ts:findTranscripts`
- **Problem:** `readdirSync` on a non-existent project dir throws `ENOENT` uncaught → stack trace
  crash. No top-level error boundary; `parseSince`/`writeFileSync` failures surface raw.
- **Plan:**
  - [x] `findTranscripts` treats ENOENT as "no transcripts" (returns `[]`).
  - [x] Top-level `try/catch` in `cli.ts` prints `error: <msg>` to stderr, sets `exitCode = 1`.
- **Verify:** `yarn verify` green.

### A5 — Align `--since` default with the command contract _(Low)_ ✅ done (3fae72d)

- **Where:** `tools/session-analyzer/src/cli.ts:24` vs `.claude/commands/session-review.md`
- **Problem:** CLI defaulted to `--since all`; the `/session-review` command documents `7d`.
- **Plan:**
  - [x] Changed the CLI default to `'7d'`.
- **Verify:** `yarn verify` green.

### A6 — Narrow the config-file ignore _(Low)_ ⏸ deferred (a52be6a notes the deferral)

- **Where:** `eslint.config.mjs:21-24`
- **Problem:** blanket `**/*.config.{js,mjs,ts}` ignore hides config files from _all_ linting, not
  just type-aware rules.
- **Plan:**
  - [ ] Switch to `projectService: { allowDefaultProject: ['*.config.*'] }`.
- **Deferred because (found during work):** `allowDefaultProject` rejects `**` in its globs and
  matches on a different axis than plain `ignores`; switching surfaced the tseslint
  `config()` deprecation (a migration to `defineConfig()`) as a separate, blocking change.
  Re-scoped out of this behaviour-preserving pass. The blanket ignore stays, with a comment
  pointing here (commit a52be6a).

### A7 — Fix the stale "Dockerfiles outdated" note _(Low, docs)_ ✅ done (3fae72d)

- **Where:** `CLAUDE.md` (the stack-decisions section).
- **Problem:** no Dockerfiles exist; compose builds nothing. The "npm ci in Dockerfiles" and
  "flat src/+prisma in compose" notes were themselves stale.
- **Plan:**
  - [x] Reworded to reflect current state (prebuilt images; app Dockerfiles deferred to their
        tasks).

### A8 — Full cross-slice FSD enforcement _(Medium, new)_ [ ] todo

- **Found during A1.** `no-internal-modules` blocks deep imports from `app/` (works), but it
  cannot enforce slice isolation for a slice importing another slice's internals via the `@/`
  alias: there is no TS-aware ESLint resolver configured, so the rule never resolves alias
  targets and stays silent. `docs/15 §2.2` calls this invariant load-bearing.
- **Plan:**
  - [ ] Add `eslint-import-resolver-typescript` (understands tsconfig `paths`).
  - [ ] Configure `import/no-restricted-paths` with zones for the FSD layers
        (`app/ → features/ → shared/ → packages/`, one-way; block cross-slice deep imports).
  - [ ] Keep `no-internal-modules` for the `node_modules` subpath hygiene it now does.
- **Verify:** empirically confirm a cross-slice deep import (`features/x/ui → features/y/model`)
  is flagged; `yarn lint` green on the real tree.

---

## Stream B — `fix/*` (bug-fix, changes behaviour)

Goal: correct defects. Separate PRs or one `fix/*` PR with conventional-commit-per-fix.

### B1 — Stop logging the plaintext password _(High, security)_ ✅ done (4a23bdb)

- **Where:** `packages/db/scripts/seed-dev-user.ts:37`
- **Plan:**
  - [x] Log only `email` + `uiMode`. Default credentials stay documented in the file header.
- **Verify:** `yarn verify` green.

### B2 — Add `forwardRef` to UI primitives _(High, API)_ ✅ done (fecc8a9)

- **Where:** `packages/ui/src/{Button,Input,Card,CardTitle,CardDescription}.tsx`
- **Plan:**
  - [x] Converted all five to `forwardRef`; props types unchanged.
- **Verify:** `yarn verify` green; `apps/web` compiles.

### B3 — Make `JWT.uiMode` optional + default in the session callback _(Medium)_ ✅ done (fb22c1f)

- **Where:** `apps/web/src/features/auth/model/types.d.ts`, `config.ts`
- **Plan:**
  - [x] `JWT.uiMode` → optional; session callback defaults `token.uiMode ?? 'BASIC'`.
- **Verify:** `guards.test.ts` still green (57 tests).

### B4 — Fix Spinner accessibility + English default _(Medium)_ ✅ done (50c5a26)

- **Where:** `packages/ui/src/Spinner.tsx`
- **Plan:**
  - [x] Default label → `'Loading'`; `aria-hidden` → `label == null`; drop `role='status'` when
        hidden.
- **Verify:** `yarn verify` green.

### B5 — Wire `Field` label/error association _(Medium, a11y)_ ✅ done (4835053)

- **Where:** `packages/ui/src/Input.tsx:Field`
- **Plan:**
  - [x] Chose `cloneElement` over render-prop to keep the declarative `<Field><Input/></Field>`
        API. `Field` generates an id via `useId()`, renders `<label htmlFor>`, and clones the
        single child to inject `id` + `aria-describedby` (consumer-supplied values win). Wrapper
        switched from `<label>` to `<div>` now that association is explicit.
- **Verify:** `yarn verify` green; `SignInForm.tsx` (Field without `error`) compiles and renders.

---

## Stream C — `feat(db)/*` (schema migration)

Goal: data-model correctness. Needs product decisions and a new migration — do last, with care.

### C1 — Decide `onDelete` semantics _(Medium)_

- **Where:** `schema.prisma:69` (`ProjectMeta.owner`), `:89` (`DeploymentMeta.project`)
- **Decision needed:** RESTRICT (block user delete if they own projects) vs Cascade vs SetNull
  (reassign). RESTRICT is the safe default; the _current_ implicit behaviour is already RESTRICT
  via the migration, but it is undocumented.
- **Plan:**
  - [ ] Make the intent explicit (`onDelete: Restrict`) or pick the product behaviour.
  - [ ] If behaviour changes, document in `docs/12-open-questions.md` status table.

### C2 — Add FK indexes for NextAuth hot paths _(Low)_

- **Where:** `schema.prisma:108` (`Session.userId`), `:127` (`Account.userId`)
- **Plan:**
  - [ ] `@@index([userId])` on both; optionally `@@index([identifier])` on `VerificationToken`.

### C3 — Type the encrypted-config `Json` fields _(Medium)_

- **Where:** `schema_project_template.prisma:29` (`ModelConfig.config`), `:244`
  (`EmbeddedAgent.config`)
- **Plan:**
  - [ ] Introduce a branded/validated shape (zod in `@aiflow/crypto`, once that package is real)
        and validate on write. Until then, at least a JSDoc invariant + a runtime guard at the
        write site.

### Migration

- [ ] Whatever subset of C1–C3 lands: `npx prisma migrate dev --name <slug>` against the **public**
      schema only; regenerate (`yarn workspace @aiflow/db generate`); update the project-SQL script
      if project-template fields change.

---

## Execution order (suggested)

1. **A1** (re-enable FSD rule) first — it may surface real violations that are cheaper to fix
   before more code lands on top.
2. Then the rest of **Stream A** in any order (independent, all low-risk).
3. **Stream B** next, one fix per commit so reverts are surgical. B1 (password) and B3 (JWT) are
   quick wins.
4. **Stream C** last, after the product decision in C1 is made.

## Completion criteria per item

- `yarn verify` green (typecheck → lint → format:check → test).
- If the change is user-visible or architectural, update the state files in the same commit:
  `CLAUDE.md` / `docs/14` / `docs/16` per the table in `CLAUDE.md`.
- Conventional Commits, workspace scope, linear history, `--force-with-lease` only.
