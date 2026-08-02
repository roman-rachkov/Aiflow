# AI Studio — Agent Tooling Registry

Catalog of MCP servers, skills, and subagents used **to build** AI Studio and candidates for shipping **inside** it.

## Why this document exists

AI Studio is meant to eventually continue developing itself. Practical consequence: a tool that proves useful while building the platform will likely be needed inside it too — by the same AI roles (Analyst, Planner, Coder, Reviewer, Deployer), applied to user projects instead.

So every entry carries a **Scope** column:

| Value | Meaning |
|---|---|
| `dev` | Needed only to build AI Studio. Does not ship. |
| `product` | Needed inside the product, for user projects. |
| `both` | Both. The most valuable category — verify once, use twice. |

And a **Status** column: `untested` / `verified` / `rejected`. Everything starts `untested`. Listing a candidate before testing is fine and encouraged; inflating its status is not.

**Maintenance rule:** tried a capability — update the table. Ran a prompt — append a row to the test log at the bottom.

---

## 1. MCP servers

Candidates derived from the architecture (see [02-architecture.md](02-architecture.md), [10-infrastructure.md](10-infrastructure.md)): every infrastructure service is a potential integration point.

| Server | Purpose | Scope | Status | Notes |
|---|---|---|---|---|
| `filesystem` | Read/write project files | `both` | untested | In product: sandbox working directory only, not the host FS |
| `postgres` | Schema inspection, verifying `project_{uuid}` isolation | `both` | untested | In product the sandbox has **no** network path to the DB (see [12-open-questions.md](12-open-questions.md) #2) — usable only on the worker side |
| `git` / `gitea` | History, diffs, commits | `both` | untested | Reviewer needs the diff; the spec currently fetches it via Gitea API ([08-prompt-reviewer.md](08-prompt-reviewer.md)) |
| `docker` | Sandbox lifecycle | `dev` | untested | In product the worker drives dockerode directly; an MCP layer is redundant |
| `fetch` / `web` | Reading library documentation | `both` | untested | In product: Analyst only. The Coder has no network ([07-prompt-coder.md](07-prompt-coder.md)) |
| `jetbrains` (IDE) | Inspections, refactoring, build | `dev` | in use | Connected in the current session. Does not ship — there is no IDE in production |

---

## 2. Skills

Skills are packaged instruction sets for a specific class of task.

| Skill | Purpose | Scope | Status | Notes |
|---|---|---|---|---|
| Next.js project scaffolding | Starter application template | `both` | untested | Directly tied to [12-open-questions.md](12-open-questions.md) #1: Aider is poor at creating multi-file structures from scratch. A templating skill is one possible answer |
| Prisma schema work | Models, migrations, validation | `both` | untested | Blocked on open question #2 (migrations without DB access) |
| Diff review | Structural check of changes | `both` | untested | Overlaps the `reviewer` subagent — decide what is a skill and what is a prompt |
| docker-compose generation | Deploy artifact assembly | `product` | untested | Needed by the Deployer ([04-roadmap.md](04-roadmap.md), Task 4.3) |

**Observation.** AI Studio's roles are structurally close to skills: the Analyst is an interviewing skill, the Coder a change-application skill. A skill that works well here likely transfers into the product with little rework. That is the main reason to keep this registry from day one.

---

## 3. Subagents

Definitions live in [`.claude/agents/`](../.claude/agents/) and are **mirrors of the production prompts**. Copied verbatim — a modified prompt tests nothing about the version that ships.

| Subagent | Role | Prompt source | Tools | Scope | Status | Tested on |
|---|---|---|---|---|---|---|
| `analyst` | Analyst | [05-prompt-analyst.md](05-prompt-analyst.md) | Read, Write, WebSearch, WebFetch | `both` | untested | — |
| `planner` | Planner | [06-prompt-planner.md](06-prompt-planner.md) | Read, Glob, Grep | `both` | untested | — |
| `coder` | Coder | [07-prompt-coder.md](07-prompt-coder.md) | Read, Write, Edit, Bash, Glob, Grep | `both` | untested | — |
| `reviewer` | Reviewer | [08-prompt-reviewer.md](08-prompt-reviewer.md) | Read, Glob, Grep, Bash | `both` | untested | — |
| `deployer` | Deployer | **missing** | — | `product` | no prompt | — |

**Gap: the Deployer has no prompt.** The role is declared in [01-system-spec.md](01-system-spec.md) § 2.3 and in the roadmap (Task 4.3), but no `prompt-deployer` document exists. The subagent was deliberately not created — writing a prompt "in the spirit of" the spec would mean inventing specification content. Deferred by decision: revisit once local MVP development is judged satisfactory. Tracked as T3 below.

**Permission rationale.** The Reviewer deliberately has no write access: it issues a verdict, it does not fix code — matching the ACCEPTED/REJECTED loop in [08-prompt-reviewer.md](08-prompt-reviewer.md). The Planner is read-only: its output is JSON, not files. The Coder is the only one with full write and command execution.

---

## 4. Prompt test log

The core value of this registry. Every subagent run during development is a free test of a prompt that later ships. Not recording the result wastes the run.

**Format:** append-only, absolute dates (`YYYY-MM-DD`), prompt version = commit or edit date of the source document.

| Date | Role | Prompt version | What was tested | Result | What to change |
|---|---|---|---|---|---|
| _(example)_ 2026-08-02 | Planner | `06-prompt-planner.md`, rev. 2026-08-02 | Decomposing the recipe SPEC example into a JSON task array | Valid JSON, 4 tasks, dependencies correctly ordered | Missing an authentication setup task although SPEC calls for it — strengthen the "infrastructure first" rule |

_(the row above is a format sample, not a real run; delete it on first real entry)_

---

## 5. Open tooling questions

Same style as [12-open-questions.md](12-open-questions.md): decision points, not criticism.

### T1. Coder: Claude Code or Aider?

In production the Coder prompt is executed by Aider in a sandbox ([11-sandbox.md](11-sandbox.md)). During development, by Claude Code. Different executors, same prompt, different behavior.

Options:
- Treat Claude Code runs as testing prompt *content* only; test Aider behavior separately.
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
- A lint rule in the acceptance loop that rejects Cyrillic in Planner/Reviewer JSON output.
- A shared prompt preamble stating the policy, included by every role.
- Rely on the policy stated in `CLAUDE.md` and review discipline.

**Affected artifacts:** [`CLAUDE.md`](../CLAUDE.md), docs 05–08

---

## Question status

| # | Question | Status |
|---|--------|--------|
| T1 | Coder: Claude Code or Aider | Open |
| T2 | Prompt mirror sync | Open |
| T3 | Deployer prompt | Deferred (post-MVP local) |
| T4 | User-facing tooling | Open |
| T5 | Enforcing the language policy | Open |
