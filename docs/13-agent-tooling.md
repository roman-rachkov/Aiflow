# AI Studio — Agent Tooling Registry

Catalog of MCP servers, skills, and subagents used **to build** AI Studio and candidates for shipping **inside** it.

## Why this document exists

AI Studio is meant to eventually continue developing itself. Practical consequence: a tool that proves useful while building the platform will likely be needed inside it too — by the same AI roles (Analyst, Planner, Coder, Reviewer, Deployer), applied to user projects instead.

So every entry carries a **Scope** column:

| Value     | Meaning                                                    |
| --------- | ---------------------------------------------------------- |
| `dev`     | Needed only to build AI Studio. Does not ship.             |
| `product` | Needed inside the product, for user projects.              |
| `both`    | Both. The most valuable category — verify once, use twice. |

And a **Status** column: `untested` / `verified` / `rejected` / `in use`. Everything starts `untested`. Listing a candidate before testing is fine and encouraged; inflating its status is not.

And a **License** column, governed by § 8 of [15-engineering-conventions.md](15-engineering-conventions.md). The rule is asymmetric on purpose: `scope: dev` only has to _record_ the licence, while `scope: product` or `both` must be on the allowlist (MIT, Apache-2.0, BSD, ISC, 0BSD, Unlicense). `unverified` is a rejection, not a pending state — and promoting an entry from `dev` to `product` re-triggers the check.

**Maintenance rule:** tried a capability — update the table. Ran a prompt — append a row to the test log at the bottom.

---

## 1. MCP servers

Candidates derived from the architecture (see [02-architecture.md](02-architecture.md), [10-infrastructure.md](10-infrastructure.md)): every infrastructure service is a potential integration point.

| Server            | Purpose                                                 | Scope  | License    | Status   | Notes                                                                                                                                             |
| ----------------- | ------------------------------------------------------- | ------ | ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `context7`        | Up-to-date library documentation                        | `both` | MIT        | in use   | Configured in `.mcp.json`. `@upstash/context7-mcp`, verified via `npm view`. Product counterpart: the Analyst reading docs the Coder cannot fetch |
| `omniroute`       | Model routing                                           | `dev`  | MIT        | untested | In `.mcp.json` but not in `enabledMcpjsonServers`. Overlaps our own `model-router` — decide which owns routing before promoting it to `product`   |
| `filesystem`      | Read/write project files                                | `both` | unverified | untested | In product: sandbox working directory only, not the host FS                                                                                       |
| `postgres`        | Schema inspection, verifying `project_{uuid}` isolation | `both` | unverified | untested | In product the sandbox has **no** network path to the DB (see [12-open-questions.md](12-open-questions.md) #2) — usable only on the worker side   |
| `git` / `gitea`   | History, diffs, commits                                 | `both` | unverified | untested | Reviewer needs the diff; the spec currently fetches it via Gitea API ([08-prompt-reviewer.md](08-prompt-reviewer.md))                             |
| `docker`          | Sandbox lifecycle                                       | `dev`  | unverified | untested | In product the worker drives dockerode directly; an MCP layer is redundant                                                                        |
| `fetch` / `web`   | Reading library documentation                           | `both` | unverified | untested | In product: Analyst only. The Coder has no network ([07-prompt-coder.md](07-prompt-coder.md))                                                     |
| `jetbrains` (IDE) | Inspections, refactoring, build                         | `dev`  | Apache-2.0 | in use   | Connected in the current session. Does not ship — there is no IDE in production                                                                   |

### 1.1 Measured capability gaps

Not candidates someone proposed — capabilities the agent **tried to use and found
absent**, counted by `tools/session-analyzer` (`capabilityGaps`). A repeated call
to a nonexistent tool is the toolset stating a requirement, so it earns a row here
rather than a workaround ([17-session-review.md](17-session-review.md) § 3.4).

| Candidate    | Attempts | Scope | Verdict                                                                                                                                                                        |
| ------------ | -------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PowerShell` | 16       | `dev` | **Open.** On this Windows host `Bash` (Git Bash) is the only shell. Either accept that and stop reaching for PowerShell, or add it — but 16 attempts means the ambiguity costs |

---

## 2. Skills

Skills are packaged instruction sets for a specific class of task.

| Skill                       | Purpose                                                                                                             | Scope     | License    | Status                 | Notes                                                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------- | ---------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js project scaffolding | Starter application template                                                                                        | `both`    | unverified | untested               | Directly tied to [12-open-questions.md](12-open-questions.md) #1: Aider is poor at creating multi-file structures from scratch. A templating skill is one possible answer |
| Prisma schema work          | Models, migrations, validation                                                                                      | `both`    | unverified | untested               | Blocked on open question #2 (migrations without DB access)                                                                                                                |
| Diff review                 | Structural check of changes                                                                                         | `both`    | unverified | untested               | Overlaps the `reviewer` subagent — decide what is a skill and what is a prompt                                                                                            |
| docker-compose generation   | Deploy artifact assembly                                                                                            | `product` | unverified | untested               | Needed by the Deployer ([04-roadmap.md](04-roadmap.md), Task 4.3)                                                                                                         |
| `ai-studio-internals`       | Lazy-loaded context for rarely-needed AI Studio internals (ports, isolation, hardening, generated-code conventions) | `dev`     | ours       | verified               | Not a product candidate — a pure context-cost measure. Receives sections moved out of `CLAUDE.md`, which is billed on every turn of every session                         |
| `notes`                     | Capture an idea for later without acting on it — verbatim, expanded, critiqued                                      | `both`    | ours       | in use                 | Ours, no external dependency. Deliberately cannot develop: no Bash in `/note`'s tool cap. Product counterpart is the Analyst parking a request that is out of SPEC scope  |
| `session-report`            | HTML report of token/cache/subagent cost                                                                            | `dev`     | Apache-2.0 | in use                 | Anthropic's, run **unmodified** — cost only, no tool-flow data. Deliberately not forked; we wrote `tools/session-analyzer` alongside it (§ 8.3 of conventions)            |
| `find-skills`               | Discovering installable skills                                                                                      | `dev`     | unverified | rejected for `product` | Ships no LICENSE file. Also recommends by install count, not licence — unusable as a `product` gate. Fine for dev browsing; `/tool-scout` is the licence-aware path       |

**Observation.** AI Studio's roles are structurally close to skills: the Analyst is an interviewing skill, the Coder a change-application skill. A skill that works well here likely transfers into the product with little rework. That is the main reason to keep this registry from day one.

---

## 3. Subagents

Definitions live in [`.claude/agents/`](../.claude/agents/), and they fall into two groups.

**The five role agents are mirrors of the production prompts.** Copied verbatim — a modified prompt tests nothing about the version that ships. These have a `Prompt source`.

**The three dev-only agents below the divider are ours.** They mirror nothing, ship nowhere, and exist to make mechanical work cheap. They run on the free local slot (see § 5) and hold read-only tools by design.

| Subagent      | Role     | Prompt source                                  | Tools                               | Scope     | Status                 | Tested on                             |
| ------------- | -------- | ---------------------------------------------- | ----------------------------------- | --------- | ---------------------- | ------------------------------------- |
| `analyst`     | Analyst  | [05-prompt-analyst.md](05-prompt-analyst.md)   | Read, Write, WebSearch, WebFetch    | `both`    | tested — defects found | 2026-08-02, AI Studio dogfooding SPEC |
| `planner`     | Planner  | [06-prompt-planner.md](06-prompt-planner.md)   | Read, Glob, Grep                    | `both`    | tested — defects found | 2026-08-02, same SPEC, MVP-0 slice    |
| `coder`       | Coder    | [07-prompt-coder.md](07-prompt-coder.md)       | Read, Write, Edit, Bash, Glob, Grep | `both`    | untested               | —                                     |
| `reviewer`    | Reviewer | [08-prompt-reviewer.md](08-prompt-reviewer.md) | Read, Glob, Grep, Bash              | `both`    | untested               | —                                     |
| `deployer`    | Deployer | **missing**                                    | —                                   | `product` | no prompt              | —                                     |
| —             | —        | —                                              | —                                   | —         | —                      | —                                     |
| `classifier`  | —        | none (dev-only)                                | Read, Grep, Glob                    | `dev`     | untested               | —                                     |
| `doc-checker` | —        | none (dev-only)                                | Read, Grep, Glob                    | `dev`     | untested               | —                                     |
| `lang-lint`   | —        | none (dev-only)                                | Read, Grep, Glob                    | `dev`     | untested               | —                                     |

**Gap: the Deployer has no prompt.** The role is declared in [01-system-spec.md](01-system-spec.md) § 2.3 and in the roadmap (Task 4.3), but no `prompt-deployer` document exists. The subagent was deliberately not created — writing a prompt "in the spirit of" the spec would mean inventing specification content. Deferred by decision: revisit once local MVP development is judged satisfactory. Tracked as T3 below.

**Permission rationale.** The Reviewer deliberately has no write access: it issues a verdict, it does not fix code — matching the ACCEPTED/REJECTED loop in [08-prompt-reviewer.md](08-prompt-reviewer.md). The Planner is read-only: its output is JSON, not files. The Coder is the only one with full write and command execution.

The three dev-only agents are read-only for a different reason: they run on a locally-served model. A weaker model with write or exec rights is a bad trade at any price — it reports, the caller applies. This is a standing rule for the free slot, not a per-agent judgement.

**What belongs on the cheap slot.** Mechanical work with a closed answer set: sorting into known buckets, checking a claim against a file, scanning for a character range. Not: anything producing prose a human reads, anything where a plausible-but-wrong answer is expensive to detect, anything driving `Edit` (exact string matching — a weak model retries, and retries cost more than the downgrade saves).

---

## 4. Prompt test log

The core value of this registry. Every subagent run during development is a free test of a prompt that later ships. Not recording the result wastes the run.

**Format:** append-only, absolute dates (`YYYY-MM-DD`), prompt version = commit or edit date of the source document.

| Date       | Role    | Prompt version                          | What was tested                                                                                                                                                                                                              | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | What to change                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------- | ------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-02 | Analyst | `05-prompt-analyst.md`, rev. 2026-08-02 | Generating `SPEC.md` for AI Studio itself from `docs/` supplied as RAG context (dogfooding). Interview stages not exercised — a subagent has no channel to the end user, so only the generation half of the role was covered | Template followed and headings correct, but the shape fought the content: no home for background processes (queues, sandbox lifecycle, checkpointing) so they were forced into "Agents and automation"; no iteration field, so `(MVP-0)`/`(MVP-1)` were invented inline; `**URL**` and screen states added unprompted, breaking "follow the template exactly". Found five real model gaps — `Task` dependencies, `User` role, `Specification` approval, `ChatMessage` fields, pgvector placement | Add a section for background processes and a structured `scope` field; add `URL` and `States` to the screen block; give `[Element type]` a fixed vocabulary; split human roles from internal AI roles                                                                                                                                                                                                   |
| 2026-08-02 | Planner | `06-prompt-planner.md`, rev. 2026-08-02 | Decomposing the Analyst's AI Studio `SPEC.md` (above) into the MVP-0 task array                                                                                                                                              | 54 tasks, valid JSON, dependencies ordered, correctly refused to invent a `Task` dependency relation the schema lacks. Confirmed the Analyst's prediction only halfway: `**URL**` helped rather than broke parsing, but inline `(MVP-0)` markers required scanning every Logic paragraph and are one typo away from mis-scoping. Output hit the response limit at 54 tasks — the JSON array is too large to return alongside anything else                                                       | Add `status`, `effort`, and a `needsConfirmation`/`deviations` flag (it invented `User.role`, `Specification.approvedAt`, `packages/crypto` with no way to signal them); distinguish hard from soft dependencies; drop the "2–3 files" rule for infrastructure tasks; the CRUD-only example does not cover queues, proxies, or Docker; add an instruction for what to do when the spec is contradictory |

---

## 5. Model tiering

Cost per agent-turn is not uniform, and until 2026-08-02 nothing here acted on that: no agent declared a model, so all inherited `CLAUDE_CODE_SUBAGENT_MODEL` and every role ran on the paid slot — including the most mechanical ones.

### The two slots

| Tier | Alias            | Resolves to                                        | Cost    | Holds                                     |
| ---- | ---------------- | -------------------------------------------------- | ------- | ----------------------------------------- |
| Paid | `sonnet`, `opus` | `coding` (via the local proxy)                     | metered | `analyst`, `planner`, `coder`, `reviewer` |
| Free | `haiku`          | `lmstudio/qwen/qwen3-coder-30b` (LM Studio, local) | zero    | `classifier`, `doc-checker`, `lang-lint`  |

**The aliases do not mean what they say.** `ANTHROPIC_BASE_URL` points at a local router, and the three `ANTHROPIC_DEFAULT_*_MODEL` variables are remapped there. `sonnet` and `opus` both collapse to a single `coding` target, so the two names are currently indistinguishable. `haiku` is not Anthropic Haiku — it is a local Qwen. Writing `model: haiku` in an agent is a _routing_ instruction, not a statement about which model runs.

Verified against the installed CLI (v2.1.220) rather than documentation: `MAX_THINKING_TOKENS`, `CLAUDE_CODE_MAX_OUTPUT_TOKENS`, and `CLAUDE_CODE_SUBAGENT_MODEL` all exist. `DISABLE_NON_ESSENTIAL_MODEL_CALLS` does **not** — the real name is `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, which also disables telemetry, so it was left unset deliberately.

### Why the four roles stayed on the paid slot

Each was considered for downgrade and each was kept. The saving comes from new work landing on the free slot, not from degrading the roles that matter.

| Role       | Why it stays                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `analyst`  | Interview + RAG reconciliation, user-facing prose, largest context demand                                                      |
| `planner`  | Already truncated at 54 tasks on the paid model (§ 4). A weaker model worsens the known failure, and the output is strict JSON |
| `reviewer` | Security judgement. A false `ACCEPTED` costs a debugging cycle — more than the tokens saved                                    |
| `coder`    | Mechanical in scope but drives `Edit`; a weak model retries                                                                    |

### Availability caveat

The free slot depends on LM Studio running locally. If it is down, a `model: haiku` agent **fails** — the router cannot reach the backend. That is the correct behaviour: a silent fallback to the paid slot would hide the cost it was meant to avoid. Treat a free-slot agent as unavailable, not as slow.

**Not yet verified:** that a `model: haiku` request actually terminates at LM Studio. Both aliases resolve to real entries in the router's model list, but an authenticated end-to-end probe was blocked by the permission classifier. Until someone confirms it, the routing is inferred from configuration, not observed. Tracked as T6.

### Escalation — the product-side counterpart

Anthropic's `advisor` tool (cheap primary, stronger model consulted at decision points) does not work in this setup: it requires the direct Anthropic API, while `ANTHROPIC_BASE_URL` points at a router that does not forward requests intact, and the pairing check rejects unrecognized model names. Not attempted.

The _pattern_ is worth having inside AI Studio, where we own the router. Tracked as question #9 in [12-open-questions.md](12-open-questions.md).

---

## 6. Slash commands

Commands live in [`.claude/commands/`](../.claude/commands/). They are the cheapest mechanism available: nothing enters context until invoked, and each can pin its own model. Mechanical workflows belong here rather than in `CLAUDE.md`, which is billed on every turn whether or not it is relevant.

| Command                    | Purpose                                                                                                                                     | Scope | License | Status   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------- | -------- |
| `/verify`                  | Runs `yarn verify` and reports the first failing gate                                                                                       | `dev` | ours    | untested |
| `/task-start <id> <slug>`  | Branch per [15-engineering-conventions.md](15-engineering-conventions.md) § 1.1, plus the roadmap checklist and any blocking open questions | `dev` | ours    | untested |
| `/state-sync`              | Checks whether the state files in `CLAUDE.md` have fallen behind; delegates the scan to `doc-checker`                                       | `dev` | ours    | untested |
| `/note <idea>`             | Captures an idea into `notes/` without interrupting the current task; expansion runs in a background subagent                               | `dev` | ours    | in use   |
| `/session-review [window]` | Runs `tools/session-analyzer` and writes a tool-flow retrospective to `reports/`                                                            | `dev` | ours    | in use   |
| `/tool-scout <need>`       | Finds MCP servers / skills / agents for a need and returns an SPDX licence plus an allow/deny verdict per § 8                               | `dev` | ours    | untested |

`/state-sync` is the pattern worth copying: the expensive model reads a summary, the free model does the file-by-file work.

---

## 7. Open tooling questions

Same style as [12-open-questions.md](12-open-questions.md): decision points, not criticism.

### T1. Coder: Claude Code or Aider?

In production the Coder prompt is executed by Aider in a sandbox ([11-sandbox.md](11-sandbox.md)). During development, by Claude Code. Different executors, same prompt, different behavior.

Options:

- Treat Claude Code runs as testing prompt _content_ only; test Aider behavior separately.
- Record the differences and maintain two variants with a shared core.
- Drop Aider in favor of a CLI agent matching what we use ourselves.

**Affected artifacts:** [07-prompt-coder.md](07-prompt-coder.md), [11-sandbox.md](11-sandbox.md)

### T2. Keeping prompt mirrors in sync

Files in `.claude/agents/` duplicate `docs/05`–`08`. Drift is inevitable if it depends on discipline.

Options:

- Generate `.claude/agents/*.md` from `docs/` via script (docs = source of truth).
- Inverse: agents are source, docs are generated.
- Keep manual sync, add a check to the acceptance loop.

**Affected artifacts:** [`.claude/agents/`](../.claude/agents/), docs 05–08

### T3. Deployer prompt

Role exists, prompt does not. Deferred by decision until local MVP development is judged satisfactory. Open question when revisited: does deployment need an LLM at all, or is it deterministic enough (build image + run) to be plain code?

**Affected artifacts:** [01-system-spec.md](01-system-spec.md), [04-roadmap.md](04-roadmap.md)

### T4. What tooling reaches the user

The Engineer ("Uncle Vasya") may want their own MCP servers for their project. The Customer ("Aunt Zina") definitely does not.

Options:

- Fixed set baked into the platform.
- Allowlist, toggleable by the Engineer in project settings.
- Defer to MVP-2.

**Affected artifacts:** [01-system-spec.md](01-system-spec.md) § 2.2, [09-ui-spec.md](09-ui-spec.md)

### T5. Language policy vs. existing prompts

The project has adopted: **internal agent-to-agent traffic in English, user-facing output in the user's language** — a token-cost measure (Russian tokenizes ~2–3× worse for equivalent content).

The prompts in `docs/05`–`08` have been translated accordingly. The remaining decision is enforcement: how do we prevent a future prompt edit from reintroducing Russian into internal traffic?

Options:

- A lint rule in the acceptance loop that rejects Cyrillic in Planner/Reviewer JSON output. **Partly built:** the `lang-lint` agent (§ 3) implements the check and runs free. What is missing is the _loop_ — an agent someone has to remember to invoke is not enforcement, so this stays Open.
- A shared prompt preamble stating the policy, included by every role.
- Rely on the policy stated in `CLAUDE.md` and review discipline.

**Affected artifacts:** [`CLAUDE.md`](../CLAUDE.md), docs 05–08, [`.claude/agents/lang-lint.md`](../.claude/agents/lang-lint.md)

### T6. Confirm the free slot actually routes free

`model: haiku` is configured to reach a local Qwen in LM Studio, and § 5 records the whole tiering policy on that basis. The routing has not been observed end to end — both aliases resolve to real entries in the router's model list, but an authenticated probe was blocked by the permission classifier before it ran.

Until this is confirmed, three dev-only agents may be quietly billing to the paid slot, which inverts the point of the exercise.

Options:

- Send one authenticated request per alias through the router and compare the `model` field in the response against what was asked for.
- Watch the LM Studio server log while invoking `classifier` on a trivial input.
- Stop the LM Studio server and confirm a `model: haiku` agent fails rather than silently succeeding — the more valuable test, since it proves there is no hidden fallback.

**Affected artifacts:** [`.claude/agents/`](../.claude/agents/) (the three dev-only agents), § 5 of this document

### T7. Whether the tool-flow findings should feed the product

`tools/session-analyzer` now measures what the agent calls, where it fails, and what it reaches for and cannot find. AI Studio runs the same loop for user projects, so the same instrumentation would answer "is the Coder struggling" with data instead of anecdote.

Open because the shape is not obvious: `TaskLog` currently checkpoints task-level progress, and tool-level telemetry is a schema change plus a decision about retention.

Options:

- Extend `TaskLog` with per-tool outcomes and reuse the taxonomy (including the `ourProblem` split — a task that failed because the model router was down must not be re-planned as if the code were wrong).
- Keep it dev-only; the product's failure modes are different enough that shared code would be a false economy.
- Emit the analyzer's JSON shape from the sandbox runner and analyze it out of band.

**Affected artifacts:** [03-data-model.md](03-data-model.md) (`TaskLog`), [11-sandbox.md](11-sandbox.md), `tools/session-analyzer`

---

## Question status

| #   | Question                            | Status                                                       |
| --- | ----------------------------------- | ------------------------------------------------------------ |
| T1  | Coder: Claude Code or Aider         | Open                                                         |
| T2  | Prompt mirror sync                  | Open                                                         |
| T3  | Deployer prompt                     | Deferred (post-MVP local)                                    |
| T4  | User-facing tooling                 | Open — licence policy now settled (conventions § 8), set not |
| T5  | Enforcing the language policy       | Open — `lang-lint` built, not wired into a gate              |
| T6  | Verify free-slot routing end to end | Open — see § 5, availability caveat                          |
| T7  | Tool-flow telemetry in the product  | Open — analyzer built dev-side, product shape undecided      |
