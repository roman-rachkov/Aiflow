# Engineering Conventions

Rules that hold both for building AI Studio and for the code AI Studio generates. Settled 2026-08-02, before the first line of implementation.

None of this existed in the earlier documents — no branch was ever named, no size limit was ever stated, no architectural pattern was ever chosen, and refactoring appeared nowhere as an activity. This file fills those gaps. Where it contradicts an older document, this file wins and the older one is stale.

---

## 1. Git workflow

### 1.1 One task, one branch, one PR

Applies at both levels: our development of the platform, and the platform's own code generation for user projects.

```
main                 always green, always deployable, linear history
task/{id}-{slug}     one Coder task or one roadmap task
```

Branch naming:

| Context              | Pattern                    | Example                         |
| -------------------- | -------------------------- | ------------------------------- |
| Platform development | `task/{roadmap-id}-{slug}` | `task/1.1-scaffold-next-app`    |
| Refactoring          | `chore/refactor-{scope}`   | `chore/refactor-spec-interview` |
| Product: Coder task  | `task/{taskId}-{slug}`     | `task/c7f3a1-add-recipe-model`  |

`{slug}` is kebab-case, ASCII, derived from the task title, truncated to 40 characters.

### 1.2 Rebase, never merge commits

`main` history stays linear. Before a PR merges, the branch is rebased onto current `main`, then fast-forwarded. No merge commits, no `--no-ff`.

```bash
git fetch origin
git rebase origin/main
# resolve, verify, then
git push --force-with-lease
```

`--force-with-lease`, not `--force` — it refuses the push if someone else moved the ref, which `--force` would silently discard.

Enforced by config, committed to the repo:

```
# .gitconfig fragment — apply with: git config --local include.path ../.gitconfig-shared
[pull]
    rebase = true
[merge]
    ff = only
[rebase]
    autoStash = true
    autosquash = true
```

GitHub side: enable "Rebase and merge" only; disable "Create a merge commit" and "Squash and merge". Squash is disabled deliberately — a task that produced three logical commits should keep them, and task granularity already keeps PRs small (§ 1.4).

### 1.3 Commit messages

Conventional Commits, English, imperative mood:

```
<type>(<scope>): <subject>
```

`type` ∈ `feat` · `fix` · `refactor` · `chore` · `docs` · `test` · `perf`. `scope` is the workspace package or feature slice: `web`, `worker`, `db`, `spec-interview`. Subject ≤ 72 characters, no trailing period.

The AI Coder already emits this shape — `docs/07-prompt-coder.md:85` shows `feat: add Recipe model`. Adding the scope is the only change.

### 1.4 Why branch-per-task changes an architectural decision

`docs/02-architecture.md:125` serializes sandboxes per project "to avoid Git conflicts". That serialization exists _because_ everything committed to one branch. With one branch per task, parallel Coder tasks no longer share a working ref, and open question #3 (`docs/12-open-questions.md:36`) loses its premise.

This does not make concurrency free. Two parallel tasks touching the same file still conflict at rebase time. The rule: **the Planner may only mark tasks as parallel-eligible when their file sets are disjoint.** Since `docs/06-prompt-planner.md:23` already caps a task at 2–3 files, that check is cheap. Tasks with overlapping file sets stay sequential via their `dependencies` edge.

### 1.5 Schema changes this requires

`Task` (`docs/03-data-model.md:102`) currently has no Git fields at all. Branch-per-task needs:

```prisma
branchName    String?   // task/{id}-{slug}, null until the sandbox starts
headCommit    String?   // SHA the sandbox produced
mergedAt      DateTime? // set when the branch fast-forwards into main
```

Two pre-existing schema gaps surface at the same time and should be fixed in the same migration, since both block the Roadmap UI (`docs/09-ui-spec.md:87`):

- **`dependencies` has nowhere to land.** The Planner emits it (`docs/06-prompt-planner.md:44`) and the UI draws it, but `Task` has no self-relation. Needs an explicit many-to-many join.
- **`priority` type mismatch.** `Task.priority` is `Int @default(0)` (`docs/03-data-model.md:107`); the Planner emits the string enum `critical|high|medium|low` (`:37`). Make it a Prisma enum.

### 1.6 Manual-edit protection, now decidable

`docs/01-system-spec.md:47` ("manual/auto branches") was an orphaned phrase with no design, and `docs/09-ui-spec.md:121` left the choice open between blocking the task and creating a branch. Branch-per-task answers it: **the Engineer's manual work is itself a branch**, and generation never touches a ref it did not create. Conflict surfaces at rebase, where Git is designed to handle it, instead of as silent overwrite.

---

## 2. Module architecture

### 2.1 Feature-sliced, with shared logic extracted to workspace packages

Two levels of boundary. Inside `apps/web`, code is grouped by business capability, not by technical kind. Anything used by more than one app becomes a workspace package, where the boundary is enforced by the module graph rather than by discipline.

```
packages/
├── db/           Prisma schema, generated client, shared domain types
├── queue/        BullMQ queue definitions, job payload types
├── ai-roles/     role prompts + model-router invocation
└── ui/           design system: primitives, tokens
apps/web/src/
├── features/
│   ├── spec-interview/
│   │   ├── api/       route handlers
│   │   ├── ui/        components
│   │   ├── model/     state, types, validation
│   │   └── index.ts   ← the only public surface
│   ├── task-board/
│   └── deployment/
├── shared/       app-local utils and hooks, not worth a package yet
└── app/          Next.js routing only — thin, delegates into features
apps/worker/src/
└── queues/       one directory per queue: spec, plan, code, deploy
```

`packages/ai-roles/` is the load-bearing one. Role prompts currently live in `docs/05`–`08` and are duplicated by hand into `.claude/agents/` — a divergence risk already logged as T2 in `docs/13-agent-tooling.md`. Making the package the single source, with docs and agent mirrors generated from it, settles that question.

### 2.2 The three rules that keep slices small

**Slices do not import each other's internals.** `features/task-board` may import `features/spec-interview` only through its `index.ts`. Reaching into `features/spec-interview/model/parser.ts` is forbidden — enforced by `import/no-internal-modules`.

**Dependencies point one way:** `app/` → `features/` → `shared/` → `packages/`. No arrow backwards, no arrow sideways between slices. A slice that needs another slice's logic means that logic belongs in `shared/` or a package.

**`app/` holds no logic.** A `page.tsx` composes a feature and nothing more. This is the routing layer, not a place to put code.

### 2.3 When a slice becomes a package

Promote when it is imported by two apps, or when it stops being UI-facing at all. `queue/` and `db/` are packages because both `web` and `worker` need them. A slice used only by `web` stays a slice — premature packaging costs more in build wiring than it returns.

**One standing exception: `packages/ui`** (Task 1.2d, decision #10). It was created while `apps/web` was still its only consumer, which this rule would forbid. The reasoning for overriding it: a design system is foundational rather than incidental — every screen built without shared tokens has to be retrofitted with them later, and that cost grows with each screen, whereas the build wiring is paid once. The rule is unchanged for everything else; an exception argued on these grounds needs the same kind of case, not merely an expectation that a second consumer might arrive.

The exception carries a boundary, which is what keeps it from swallowing the rule: `packages/ui` holds primitives and tokens that know nothing about any particular app. App composition — the header and side menu, which encode this app's routes — stays in `apps/web/src/shared/ui`.

---

## 3. Size limits

### 3.1 Numbers

| Unit                  | Limit     | ESLint rule              |
| --------------------- | --------- | ------------------------ |
| File                  | 200 lines | `max-lines`              |
| Function              | 50 lines  | `max-lines-per-function` |
| Cyclomatic complexity | 10        | `complexity`             |
| Nesting depth         | 4         | `max-depth`              |
| Function parameters   | 4         | `max-params`             |

Blank lines and comments are excluded from line counts (`skipBlankLines`, `skipComments`).

Per-module budget: a feature slice exceeding **400 lines** across its own files is a refactoring candidate, checked at the cadence in § 5 rather than by the linter, since ESLint has no cross-file view.

### 3.2 Severity: warning locally, error in CI

Every rule above is configured `warn`. Because both the sandbox and CI run `--max-warnings 0` (`docs/11-sandbox.md:162`), a violation still blocks the merge — but it does not interrupt a work-in-progress file mid-edit. Strictness where it matters, quiet where it does not.

**One prerequisite: the lint gate is currently fake.** `docs/11-sandbox.md:204-207` catches an ESLint failure, appends a `[WARNING]` line, and leaves `status = 'success'`. So `--max-warnings 0` blocks nothing today, and no size limit will be enforced until `runner.js` treats lint failure as fatal. Fixing that is part of the scaffolding task.

### 3.3 Exemptions

Generated files (`packages/db/generated/`, `next-env.d.ts`), migrations, and config files are exempt via ESLint `overrides`. Test files get a 400-line allowance — table-driven tests are legitimately long and splitting them hurts readability.

An exemption in application code requires an inline disable _with a reason_:

```ts
/* eslint-disable-next-line max-lines -- Prisma schema mirror, split would break codegen */
```

A bare `eslint-disable` with no `--` justification is itself a lint error (`eslint-comments/require-description`).

---

## 4. Linter and formatter

### 4.1 Division of labour

Prettier owns formatting. ESLint owns correctness and structure, and carries no stylistic rules — `eslint-config-prettier` last in `extends` switches off every rule the two would fight over. Formatting is never a review topic.

### 4.2 ESLint

Flat config, `eslint.config.mjs` at the repo root, one shared base with per-package overrides. No config content existed before — only the bare command — so this is the whole specification.

```
next/core-web-vitals          Next.js + React + a11y
@typescript-eslint            strict-type-checked, requires a project reference
eslint-plugin-import          resolution, cycles, boundaries
eslint-plugin-unused-imports  auto-removable dead imports
eslint-comments               disable directives must be justified
eslint-config-prettier        last — disables conflicting stylistic rules
```

Rules that matter beyond the presets:

| Rule                                      | Setting | Why                                                           |
| ----------------------------------------- | ------- | ------------------------------------------------------------- |
| `@typescript-eslint/no-explicit-any`      | error   | `docs/07-prompt-coder.md:28` already forbids `any`            |
| `@typescript-eslint/no-floating-promises` | error   | An unawaited promise in a worker silently loses a job         |
| `import/no-cycle`                         | error   | Cycles are how small modules quietly become one big one       |
| `import/no-internal-modules`              | error   | Enforces § 2.2 slice boundaries                               |
| `no-restricted-imports`                   | error   | Blocks `app/` → deep feature paths, and cross-slice internals |
| size rules from § 3.1                     | warn    | Blocking via `--max-warnings 0`                               |

`strict-type-checked` requires type information, which makes lint slower than a syntax-only pass. Worth it: it is what catches floating promises and unsafe `any` propagation, both of which matter more in a queue-driven system than in a typical app.

### 4.3 Prettier

`.prettierrc` at the repo root. Prettier is named in four places across the docs (`docs/02-architecture.md:69`, `docs/04-roadmap.md:32`, `docs/07-prompt-coder.md:15`) and **invoked in none** — `runner.js` never calls it, and `docs/07-prompt-coder.md:15` hedges with "(if configured)". This configures it.

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

`prettier-plugin-tailwindcss` sorts class strings canonically. Tailwind is mandated (`docs/07-prompt-coder.md:25`) and class order is exactly the kind of noise that makes AI-generated diffs unreadable.

`printWidth: 100` rather than 80 — JSX with typed props wraps badly at 80.

### 4.4 Enforcement points

Three gates, same rules, escalating cost:

1. **Editor** — format on save, ESLint inline. Zero friction.
2. **Pre-commit** — Husky + lint-staged, changed files only: `prettier --write` then `eslint --fix --max-warnings 0`. Sub-second.
3. **CI / sandbox** — `tsc --noEmit`, `eslint . --max-warnings 0`, `prettier --check .`. The authority.

`prettier --check` in CI is not redundant with the pre-commit hook: hooks can be bypassed with `--no-verify`, and the AI Coder does not run them at all.

Two things to add to the sandbox pipeline, which currently runs only tsc and ESLint (`docs/11-sandbox.md:152`, `:162`):

- `prettier --check` — otherwise generated code drifts from the repo's format on every task.
- `prisma validate` — claimed as acceptance tooling at `docs/02-architecture.md:69` but never actually invoked.

### 4.5 Command surface

Root `package.json`, run across workspaces via Lerna:

```json
{
  "scripts": {
    "lint": "eslint . --max-warnings 0",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "lerna run typecheck",
    "verify": "yarn typecheck && yarn lint && yarn format:check && yarn test"
  }
}
```

`yarn verify` is the single command that reproduces the CI gate locally. Every Definition of Done in § 5.3 refers to it.

---

## 5. Refactoring cadence

### 5.1 Trigger: the roadmap task boundary

Refactoring happens **after each completed roadmap task** (1.1, 1.2, 2.1, …), on its own `chore/refactor-*` branch, as its own PR.

Not after every Coder task — at 2–3 files per task (`docs/06-prompt-planner.md:23`) there is rarely anything to consolidate, and the interruption would cost more than it returns. Not per MVP milestone either — six weeks of accumulation turns cleanup into restructuring, which is the expensive kind.

The roadmap task is the right granularity because it is the smallest unit that delivers a working capability. At that moment the shape of the code is known, the duplication is visible, and nothing depends on it yet.

### 5.2 Scope: a timebox, not a mandate

**Maximum 90 minutes per pass.** If the work does not fit, it is not refactoring — it is a design change, and it becomes a tracked task with its own acceptance criteria.

A pass may: extract duplication, split files over the § 3.1 limits, move a slice's shared logic into `shared/` or a package, delete dead code, tighten types, rename for clarity.

A pass may **not**: change behaviour, add features, alter a public API another slice depends on, or touch anything the current roadmap task did not touch. Behaviour-preserving means the existing tests pass unmodified — if a test needs changing, the change is not a refactor.

### 5.3 Definition of Done, per roadmap task

Before a roadmap task is marked complete:

- `yarn verify` passes clean — types, lint, format, tests.
- No file over 200 lines, no function over 50, without a justified inline exemption.
- No feature slice over 400 lines without an entry in § 5.5.
- New public surfaces exported through the slice's `index.ts`, not deep paths.
- `CLAUDE.md` updated if an architectural invariant changed.
- `docs/16-code-map.md` updated if a package or feature slice was added, removed, or renamed.

The last point is not bookkeeping. The code map is what lets the next session — human or AI — act on an area without re-deriving its structure by search. A stale map is worse than none, because it is trusted.

### 5.4 A metric signal that overrides the cadence

Refactor immediately, without waiting for the task boundary, when any of these appears:

- The same logic exists in three places. Two is a coincidence; three is a pattern.
- `import/no-cycle` fires. A cycle means the boundary is already wrong and it compounds.
- A single file passes 300 lines — 1.5× the limit, past the point where splitting is still cheap.

### 5.5 Debt register

Deferred items go in a `## Technical debt` section at the bottom of `docs/04-roadmap.md`: what, where, why deferred, and what it blocks. This is the first place in the project where technical debt is representable at all — the concept appears nowhere in the existing documents, and `Task` has no field that could carry it.

An item that survives two roadmap tasks is either promoted to a real task or deleted from the register. A permanent debt list is a list nobody reads.

---

## 6. What this means for the product

These rules were chosen for our own development, but the platform generates code for users, so most of them have to hold on both sides. What transfers, and what does not:

| Convention               | Platform dev | Generated projects                                       |
| ------------------------ | ------------ | -------------------------------------------------------- |
| Branch per task, rebase  | yes          | yes — § 1.1, needs schema fields (§ 1.5)                 |
| Conventional Commits     | yes          | yes — Coder already close (`docs/07-prompt-coder.md:85`) |
| Feature-sliced structure | yes          | **no** — see below                                       |
| Size limits              | yes          | yes — same ESLint config in the sandbox image            |
| Prettier + ESLint gate   | yes          | yes — add both to `runner.js`                            |
| Refactoring cadence      | yes          | deferred — needs a task type the schema lacks            |

**Feature slicing does not transfer, deliberately.** Generated projects follow the stock Next.js layout the Coder prompt already specifies — `app/[resource]/page.tsx`, `components/`, `lib/actions/` (`docs/07-prompt-coder.md:26`). A user's first app is small, and Aider works more reliably against the convention it has seen most in training. Revisit if generated projects start outgrowing it.

**Refactoring in the product is deferred, not rejected.** It would need a task _type_ on `Task` to distinguish a refactor from a feature (`docs/03-data-model.md:102` has no such field), and the Reviewer would need grounds to demand one — its quality mandate in `docs/08-prompt-reviewer.md` (Responsibilities / evaluation criteria) covers readability and duplication; size limits are now on the REJECTED list, but a dedicated refactor task type is still absent. Both remain MVP-1 concerns at the earliest.

**The Reviewer gains one enforceable criterion now:** reject when the diff introduces a file over 200 lines or a function over 50. That is mechanical, needs no judgment, and gives the existing quality clause something it can actually act on.

---

---

## 7. Documents this makes stale

Not yet updated — these are edits for the scaffolding task, where paths change alongside real files:

| Document                         | What is now wrong                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/10-infrastructure.md`      | Dev path updated 2026-08-06 (`docker compose up`, stock Node, no `--build`). The **YAML sample** at the top still shows `build:` / multi-stage Dockerfiles / `npm`-era layout — that sample is **prod/future**, not the live compose file. Full sample rewrite deferred until prod Dockerfiles land.                                                                                                    |
| ~~`docs/11-sandbox.md`~~         | ~~Lint failure non-fatal, no Prettier or `prisma validate`, `--no-git` vs. `no-auto-commits` contradiction~~ — **done 2026-08-02**. ~~Still open: no commit call in `runner.js`~~ — **done Task 3.1** (`commitWorkspace` after gate)                                                                                                                                                                    |
| ~~`docs/03-data-model.md`~~      | The **Prisma schemas** carry the fixes (`Priority` enum, `TaskDependency`, `ChatMessage`, branch fields in `schema_project_template.prisma`); `WeakMap` → `Map` corrected (C1). But the doc itself was never rewritten — its `Task` model still shows `priority Int @default(0)`, no Git/branch fields, no `dependencies` self-relation, and no `ChatMessage`. Doc text still stale; schema is correct. |
| ~~`docs/08-prompt-reviewer.md`~~ | ~~Add the size criterion from § 6 to the REJECTED list~~ — **done 2026-08-07** (file ≤200 / function ≤50 on REJECTED)                                                                                                                                                                                                                                                                                   |
| `docs/09-ui-spec.md`             | § 9 is still the whole styling mandate and names no implementation: the tokens now live in `packages/ui/src/styles/theme.css` and the primitives in `packages/ui`. Its component inventory (modal, toast, tabs, timeline, file tree) is unbuilt and arrives with the screens that need it                                                                                                               |
| ~~`docs/12-open-questions.md`~~  | ~~#3 (concurrency) loses its premise~~ — **done 2026-08-02**, #3 marked Resolved                                                                                                                                                                                                                                                                                                                        |

### Resolved defect: `yarn verify` on a clean tree

Found 2026-08-02 while running the gate, fixed the same day in the scaffolding
task. `yarn lint` failed on three files unrelated to any source change:
`.pnp.cjs`, `.pnp.loader.mjs`, `eslint.config.mjs`.

Cause: `projectService: true` (§ 4.2) requires every linted file to belong to a
tsconfig. The ignore list covered `**/*.config.js` but not `.mjs`, and did not
exclude Yarn PnP's generated artifacts.

Fixed in two parts, because there were two problems:

1. **Ignore list** — added `**/*.config.mjs`, `eslint.config.mjs` and `.pnp.*`.
2. **PnP turned off** — `.yarnrc.yml` now sets `nodeLinker: node-modules`. PnP
   also broke `format:check`: Prettier could not resolve
   `prettier-plugin-tailwindcss` from the PnP store. Rather than work around
   each symptom, the linker was switched. The same toolchain goes into the
   sandbox image, where an unresolvable plugin is more expensive than the disk
   PnP saves.

Worth recording because the gate proved itself in the same session: a
deliberately over-long function was caught by `max-lines-per-function` (63 lines
against a limit of 50), so `--max-warnings 0` does block. Prior to this the
enforcement claim was untested.

---

## 8. Tooling licences

The repository is private today and the licence question for the product itself is
deferred (A3 in [14-decisions-needed.md](14-decisions-needed.md)). What is _not_
deferred is what we take in: AI Studio is a commercial product, and a dependency
admitted now under a copyleft licence becomes expensive to remove later, once code
is written against it.

### 8.1 The distinction that actually matters

Copyleft obligations are triggered by **distribution**, not by use. An
Apache-2.0 or even AGPL tool that runs on a developer's machine and never ships
imposes essentially nothing. The same tool placed in AI Studio's
`docker-compose` — where a user interacts with it over a network — can oblige us
to publish source.

So the rule follows the `Scope` column already in
[13-agent-tooling.md](13-agent-tooling.md), and the two levels are deliberately
not equally strict:

| Scope             | Requirement                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------- |
| `dev`             | **Record the licence** in the registry. No allowlist. It does not ship, so it cannot oblige |
| `product`, `both` | **Allowlist only.** Anything outside it is rejected before a line is written against it     |

### 8.2 Allowlist for `product` and `both`

Permitted: **MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD, Unlicense.**

Rejected, with the reason (the reason matters — it is what lets us re-evaluate a
specific case rather than argue from the label):

| Licence                                 | Why rejected                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| GPL-2.0, GPL-3.0, LGPL                  | Linking obliges us to publish source of the combined work                     |
| **AGPL-3.0**                            | The network-use clause is triggered by exactly our deployment model           |
| SSPL, BUSL, Elastic, "source available" | Not open source; commercial hosting is restricted or requires a licence       |
| CC-BY-NC, CC-BY-SA                      | Non-commercial, or share-alike applied to prompts and templates               |
| **No licence file**                     | No grant means no rights. Silence is a rejection, not a default of permissive |

Two rules that close the ways this gets bypassed in practice:

1. **Unverified is rejected.** A licence inferred from a README badge, an npm
   registry field alone, or a sibling package is not verified. Read the LICENSE
   file or the package's own `license` field, and record which one you checked.
2. **Reclassification re-triggers the check.** Moving an entry from `dev` to
   `product` or `both` requires the allowlist check at that moment. This is the
   likely failure path: a tool adopted casually for development, later found
   useful, and promoted without anyone re-reading its licence.

### 8.3 Derivative works

Copying a third-party file and editing it creates a derivative work, carrying the
original's attribution obligations and its upstream drift. Preferred order:
invoke the tool as-is, then write our own alongside it, and only then fork.

Worked example: the tool-flow analyzer (`tools/session-analyzer`) was written from
scratch rather than forked from Anthropic's Apache-2.0 `session-report`, even
though that script parses the same transcripts. Forking would have meant carrying
an Apache-2.0 NOTICE and manually tracking upstream changes, to gain cost metrics
we can already get by running the original unmodified. The two are complementary:
`session-report` answers "what did this cost", ours answers "how did the tooling
behave".

### 8.4 Where this is recorded

`docs/13-agent-tooling.md` carries a `License` column in the tables listing
third-party tooling — § 1 (MCP servers), § 2 (skills), § 6 (slash commands). § 3
(subagents) does not, deliberately: those are our own prompt files, with no
upstream licence to record. `/tool-scout` will not report a candidate without a
licence, and returns `deny — licence unverified` rather than a guess.
