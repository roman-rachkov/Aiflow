# Session Review — Accumulated Lessons

What survived from individual session retrospectives and became a rule. Raw
per-session output lives in `reports/*.md`, written by `/session-review`; this
file holds only what proved durable enough to change how we work.

Two levels, same as everything else in this repo: lessons about **our tool flow**
(how the agent works in this environment) and lessons about **AI Studio's own
design** (because the platform will run the same kind of loop for user projects).

---

## 1. Why this file exists

`CLAUDE.md` states the principle: every task should start from documented state,
not from a fresh sweep of the repo. That covers _what the code is_. It does not
cover _how the work went_ — which tools were wasted, which failures repeated,
what the toolset was missing.

Without that record, every session rediscovers the same friction. The
retrospective is only worth writing if the next session reads it, so a finding
that does not end in a concrete rule does not belong here.

---

## 2. Method

`/session-review` runs `tools/session-analyzer` over the JSONL transcripts under
`~/.claude/projects/<project>/`, then writes a Markdown retrospective. The
numbers below are measured, not estimated.

Two measurement rules the analyzer enforces, both learned the hard way:

**Deduplicate by entry `uuid`.** A resumed or forked session is written as a new
transcript file that repeats the parent's entries verbatim. Measured here:
`a9a47201…` shares 79 of its 80 entries with `e4f2a610…`. Globbing `*.jsonl` and
summing counts those tool calls twice. Tool calls are additionally deduplicated
by `tool_use.id` / `tool_result.tool_use_id`.

**Separate our defects from environmental noise.** See § 3.1 — this is the
difference between a report that changes behaviour and a report that just looks
alarming.

---

## 3. Findings

### 3.1 Most tool errors are environmental, and reporting them flat is misleading

Baseline over the full corpus (69 transcripts, deduplicated): **2110 tool calls,
219 errors — 10.4%.**

A flat 10.4% error rate reads like a broken workflow. It is not. Breaking it down:

| Bucket                                                                  | Share    | Ours?                     |
| ----------------------------------------------------------------------- | -------- | ------------------------- |
| Permission classifier unavailable (`automode-unavailable`, 106 denials) | dominant | No — environment          |
| Path not found                                                          | ~12      | Yes — path guessing       |
| Missing tool (`PowerShell`)                                             | ~10      | Yes — capability gap      |
| Permission denied / blocked                                             | 15       | Partly — allowlist tuning |
| User rejected                                                           | 9        | Yes — bad proposal        |
| Ripgrep timeout                                                         | ~3       | Yes — scope tuning        |
| Protocol misuse (Write before Read)                                     | ~2       | Yes                       |
| Subagent API error (405)                                                | ~2       | No — environment          |

The largest single cause of friction in this project is **the permission
classifier being unavailable**, which no code change on our side can fix. Folding
it in with genuine protocol misuse hides the ~40 errors that are actually
actionable behind ~180 that are not.

**Rule:** every error bucket carries an explicit `ourProblem` flag. A
retrospective that does not separate the two is not accepted.

### 3.2 A test gate that passes with no tests is not a gate

`yarn test` ran `lerna run test`, and every workspace without a `test` script was
skipped. The command exited 0 with zero tests executed, and `yarn verify`
reported green. The gate was decorative for as long as it existed.

Fixed by moving to a root `vitest.config.ts` with `passWithNoTests: false`, so a
workspace with no tests fails loudly instead of passing silently. Decision
recorded as B4 in [14-decisions-needed.md](14-decisions-needed.md).

**Rule:** a gate is only real once it has been observed failing. This one now
has been, as has `--max-warnings 0` (§ 7 of
[15-engineering-conventions.md](15-engineering-conventions.md) records a
deliberately over-long function being caught at 63 lines against a limit of 50).

### 3.3 Bash is displacing the dedicated tools

Measured across the corpus:

| Signal                         | Count                              |
| ------------------------------ | ---------------------------------- |
| `Bash` calls                   | 775 (37% of all tool calls)        |
| …starting with `cd`            | 246 (32% of Bash)                  |
| …embedding `grep`/`rg`         | 239, against 125 `Grep` tool calls |
| …embedding `cat`/`head`/`tail` | 497, against 615 `Read` tool calls |
| …embedding `find`              | 65                                 |

`Grep` and `Glob` return structured, permission-integrated results with clickable
file links; the piped-shell equivalents return raw text and need a separate
permission decision each time. Roughly two thirds of search work is going through
the weaker path.

The `cd` figure is a Windows-specific tax: the shell working directory resets
between calls, so absolute paths belong in the command rather than a `cd` prefix.

**Rule:** reach for `Grep`, `Glob`, and `Read` before `Bash`. Use `Bash` for
things that genuinely are commands — git, package scripts, the analyzer itself.

### 3.4 The `cd` tax is no longer theoretical

Observed 2026-08-04: a `cd packages/db` followed by a relative path produced
`packages/db/packages/db/...` (`ERR_MODULE_NOT_FOUND`), because a prior failed
command had already reset the working directory and the next call compounded on
it. The same session also hit `path-not-found` on a `cd` whose target had moved.
The 290 `cd` prefixes in this window are not just inefficient — they create a
class of failure that cannot occur with absolute paths.

**Updated 2026-08-04:** the count rose to **332** (34% of all `Bash` calls) in
the following run, after this rule was written. Documenting it changed nothing.
See § 3.9 for the silent-failure mode it produces.

**Rule:** every path in a `Bash` command is absolute. No `cd ... && cmd`. If a
script genuinely needs a working directory, pass it as the command's `cwd`, not
a shell prefix. This upgrades the § 3.3 guidance from preference to invariant.

### 3.5 Retry discipline

The top five thrash signatures this window are all the permission-classifier
outage, repeated 16, 15, 14, 12 and 10 times within single sessions. The outage
is environmental, so a single retry is justified — but sixteen is not a strategy.
A second class, unrelated: one `Read` signature repeated 9 times against a path
that did not exist, re-attempted rather than re-derived.

**Rule:** after two identical failures, change the approach — different tool,
different path, or hand the command to the user. A signature that has failed
twice will not succeed on the tenth.

### 3.6 Capability gaps surface as calls to tools that do not exist

`No such tool available: PowerShell`, attempted 10 times. That is not a mistake
to suppress — it is the toolset telling us what it lacks on this platform. The
analyzer collects these into `capabilityGaps` with an attempt count, which is the
empirical answer to "what is missing to make this IDE grown up".

**Rule:** a repeated call to a nonexistent tool opens a row in
[13-agent-tooling.md](13-agent-tooling.md), not a workaround.

**Amended 2026-08-04, after three runs reported the identical count of 16.**
Opening a row was not enough, because a row records that something is missing
without recording what to do instead. The gap closes only when the replacement
route is written down:

> Windows process and port operations go through `powershell.exe -Command "..."`
> inside `Bash`. To stop a server holding a port:
> `powershell.exe -Command "Get-NetTCPConnection -LocalPort 3000 -State Listen |
Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }"`.
> `pkill -f` exits 0 without killing anything, and filtering `Get-Process` on
> `CommandLine` matches nothing — both were tried first and both failed silently.

**Rule, amended:** a capability gap is closed by a documented working route, not
by a row noting its absence.

### 3.8 `WebFetch` does not work here; `WebSearch` is marginal

Measured 2026-08-04, twice: **15 of 15** `WebFetch` calls failed in both windows —
domain verification (`Unable to verify if domain code.claude.com is safe to
fetch`, also `github.com`) and trust-mode refusals. Several landed in the
`command-failure` bucket, which is why earlier runs read them as shell problems.
`WebSearch` was dead in the first window (16 of 16) but recovered in the second
(5 of 7) — a trust-mode or upstream change, not a fix on our side.

**Rule:** do not reach for `WebFetch` here — 0 for 30 over two windows.
`WebSearch` may be tried once; if it fails, fall back. For library and framework
documentation use `context7`, which has a 100% success rate over its calls in
both windows. For anything else, ask the user to paste the content — one message
costs less than four failed fetches.

### 3.9 A shell success code is not evidence the work happened

Observed 2026-08-04, task 1.2a: `rm -f apps/web/src/spike-adapter.ts && echo "spike removed"`
printed its confirmation while deleting nothing. The shell had reset to
`packages/db` from an earlier `cd`, the relative path matched no file, and
`rm -f` exits 0 on a missing path by design. The false confirmation stood until
an unrelated `ls` contradicted it.

This is § 3.4 with teeth: the `cd` tax does not only produce loud
`ERR_MODULE_NOT_FOUND` failures, it produces silent ones that read as success.

**Rule:** never chain a success message after a destructive command with `&&`.
Verify separately — `rm -v`, or a following `ls` — and when a command reports
success, check that the reported effect actually occurred. This generalises: a
zero exit code means the command ran, not that it did what was intended.

### 3.7 Untracked work is lost work

The `notes` skill, its `/note` command, and `notes/README.md` sat untracked while
`CLAUDE.md` — a tracked file — already advertised the command. `docs/17` (this
file) was cited from `vitest.config.ts:6` and `14-decisions-needed.md:90` but had
never been committed at all, producing exactly the dangling reference `CLAUDE.md`
warns about under "One thing that will waste your time".

**Rule:** a capability is finished when it is committed and registered in
[13-agent-tooling.md](13-agent-tooling.md), not when it works locally.

### 3.10 Enforcement must track the measured ranking, top-down

The hookify rules landed (`222eb5f`, 2026-08-04) with two blocks: `bash-cd-prefix`
and `false-success-after-rm`. Both fire — 10 denials in their first 2.7 h. But they
sit at the _bottom_ of the measured anti-pattern ranking. The largest measured
defect, `bash-instead-of-read` (732 of the window's calls), has no rule, and it
cannot take a block — `cat file | jq` is legitimate processing, not a `Read`
replacement.

**Rule:** when a measured anti-pattern gets an enforcement hook, go top-down by
count, and for tool-choice patterns (read/grep/glob displacement) use a **warn**,
not a **block** — a block is only safe where the replacement is unambiguous
(absolute paths for `cd`, `rm -v` for `rm`). Warn-granularity: match a bare
`cat`/`head`/`tail` or `grep`/`find` as the whole command, not inside a pipeline.

**Rule:** a window that straddles an enforcement change is unmeasurable. The
10-denials-vs-1498-violations split looked like a broken hook; it was a 2.7 h-old
one. Record the hook's start time in the retrospective; the next full window is
the first real measurement.

**Rule, added 2026-08-06:** the effectiveness of a **warn**-level hook is
measured by the _displacement ratio_ (`bash-embeds / dedicated-tool calls`), not
by the absolute anti-pattern count. A warn advises but does not suppress, so the
raw `bash-instead-of-*` count is structurally incapable of falling — it grows
with session volume, which is exactly what the 2026-08-06 window showed: counts
rose (732→759, 335→340, 92→98) while the read-displacement ratio _fell_ (0.83 →
0.71, i.e. Read calls grew faster than bare `cat`/`head`/`tail`). Reporting the
absolute count makes a working warn read as inert; report the ratio. A block
remains measurable by its denial count, which is the difference.

---

## 4. What this means for the product

AI Studio runs the same loop — an agent with tools, in a sandbox, retrying on
failure. Three findings transfer directly:

- **Sandbox telemetry needs the `ourProblem` split too.** A Coder task that fails
  because the model router was down is not a task that needs re-planning.
  Conflating the two would make the Reviewer reject sound work.
- **`TaskLog` should record tool-level outcomes, not just task-level ones.**
  Per-tool error rates are what makes "the Coder is struggling" measurable rather
  than anecdotal.
- **Repeated calls to absent capabilities are a product signal.** The same
  detector that found `PowerShell` here would show which tools user projects need
  in the sandbox — feeding T4 in [13-agent-tooling.md](13-agent-tooling.md).
