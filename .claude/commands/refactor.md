---
description: Timeboxed behaviour-preserving refactor pass at a task boundary — find drift, duplication, and oversized files, then commit only what the user approves
argument-hint: [scope-suffix]
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git switch:*), Bash(git branch:*), Bash(git add:*), Bash(git commit:*), Bash(git restore:*), Bash(wc:*), Bash(find:*), Bash(grep:*), Bash(npx madge:*), Bash(yarn lint), Bash(yarn format:*), Bash(yarn test), Read, Edit, Grep, Glob
---

You are running a **refactor pass** — a behaviour-preserving sweep at a task boundary, timeboxed to 90 minutes. Per `docs/15-engineering-conventions.md` this runs on a `chore/refactor-{slug}` branch, and the single rule that defines "refactor" is: **if a test has to change, it isn't one.** A refactor that changes expectations is a fix or a feature and belongs on a `task/` branch.

`$1` is an optional slug for the branch name (e.g. `1.3-chat`); if omitted, derive it from the current branch or the most recent task. The branch is created off the current HEAD (usually the tip of the task branch you just finished) — NOT off `main`.

## How this differs from `/orchestrate`

`/orchestrate` drives the Coder → Reviewer loop to _build_ features. `/refactor` does **not** spawn the Coder and does **not** write feature code. You do the mechanical sweeps yourself, apply only behaviour-preserving edits with your own hands, and report. Think of it as `/state-sync` + a code-shape sweep, with a commit at the end.

## Step 1 — Branch and baseline

1. Confirm the working tree is clean (`git status`). If not, stop — never refactor on top of uncommitted work.
2. Create `chore/refactor-{slug}` off the current HEAD.
3. Run `yarn verify` once and note the baseline test count. **This number must not drop.** A refactor that loses tests has broken the contract.

## Step 2 — Mechanical code-shape sweep (do all, they're cheap)

Run each, collect findings, do not edit yet:

- **Oversized files.** `wc -l` across `apps/`, `packages/`, `services/`, `tools/` source. Flag any non-test `.ts`/`.tsx` over 200 lines, any `*.test.*` over 400, any config/migration/script that is NOT exempt (conventions § 3 exempts `*.config.*`, `*/prisma/*`, `*/generated/*`). The lint rule already blocks these at commit time, so an oversized file here means someone added an inline exemption — check whether it still holds.
- **Circular imports.** `npx madge --circular --extensions ts,tsx apps packages services tools` (adjust globs to what exists). Any cycle is a finding.
- **Deprecated APIs.** `grep -rn "deprecated\|@deprecated\|TODO-FIXME\|eslint-disable" apps packages services` (exclude `node_modules`, `generated`, `dist`). Each hit is a candidate: is the disable still needed? Is the TODO stale?
- **Dead exports.** For a newly-added slice, check whether every exported symbol from its `index.ts` actually has a consumer. An export with no importer across the repo is dead weight (or a premature public surface).

## Step 3 — State-file drift sweep (this is where the real findings live)

The code is gated hard; the docs drift quietly. Check each against reality:

- **`docs/16-code-map.md`** — does every package/slice listed match what's on disk? Is any "empty stub" actually populated now? Is any real slice missing from the map? Any new route/page/API not listed?
- **`AGENTS.md`** stub declaration (the "Declared-but-empty stubs" paragraph) — does it still list packages that have shipped? Cross-check against `docs/16-code-map.md`.
- **`CLAUDE.md`** — architectural invariants or commands that the recent task contradicted or extended.
- **`docs/15-engineering-conventions.md` § 7** stale-documents table — anything there that the task resolved?
- **`docs/14-decisions-needed.md`** — a decision the task forced that isn't recorded yet?

You may delegate the file-by-file claim verification to the `doc-checker` subagent (free slot) the way `/state-sync` does — but for a single task boundary a direct read is often faster. Use judgement.

## Step 4 — Judge each finding (do NOT auto-apply)

This is the part that needs thought, not pattern-matching. For each finding:

- **Oversized file from genuine cohesion** (one coherent concern that just runs long) → leave it; do NOT split for the sake of a line count. Note "kept, inline exemption justified" in the report.
- **Oversized file from doing two things** → split at the seam. Verify `yarn verify` still green after.
- **"Duplicate" that serves different protocols/contexts** → LEAVE IT. Two SSE parsers where one handles OpenAI's `{choices:[{delta}]}` and the other handles our `{content}`+`event:error` are not duplicates; merging breaks cohesion. Record _why_ you left it. This is the single most common false positive — when two pieces look alike but answer different questions, the duplication is incidental, not essential.
- **Real duplicate** (same logic, same inputs, same output, in two places) → extract a shared helper. Verify tests stay green.
- **Cycle** → break it by inverting one dependency (move the shared piece down toward `packages/`). Verify.
- **Dead export** → remove it from the barrel. Verify nothing imported it (grep the whole repo).
- **Stale doc claim** → update the doc to match reality. This is the most common _real_ finding.
- **Unrecorded decision** → add it to `docs/14-decisions-needed.md` with rationale.

If the mechanical sweeps AND the drift sweep come back clean: **stop early. Report "no findings" and finish in 5 minutes.** A refactor pass with nothing to do is a valid, healthy result. Do not manufacture work.

## Step 5 — Report, then await approval

Present a single report grouped by category:

```
## Refactor pass: {slug}

Branch: chore/refactor-{slug} (off {parent})
Baseline: {N} tests, all green.

### Findings
- [code-shape] {finding} → {action taken OR left, with reason}
- [state-drift] {finding} → {action taken}

### Applied (staged, NOT committed)
- {file}: {one-line description}

### Left unchanged (with reason)
- {file/finding}: {why it's not a real duplicate / why the size is justified}

### Needs your call
- {anything ambiguous}
```

Then **stop and ask** whether to commit. Do not commit until the user confirms. If they reject a change, unstage it (`git restore`) before committing the rest. The commit message is `docs(...)`/`refactor(...)` scoped, conventional, and explicitly states "behaviour-preserving — test count unchanged (N → N)".

## Hard rules

- **Never change a test expectation.** If a test asserts `X` and after your edit it asserts `Y`, you have left refactor territory. Revert and file it as a task instead.
- **Never change a public API signature** (exported function/component name or its props). Callers depend on it.
- **Never "improve" working code for style.** Renames, reformatting beyond Prettier, comment rewording that doesn't fix a falsehood — none of this belongs here. It churns blame for no behavioural gain.
- **Never run over 90 minutes.** If the clock runs out mid-finding, commit what's verified, report the rest as carry-over, stop.
- **The test count is your contract.** State it in the report: baseline N → final N. If it changed, you broke the rule.
