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

| Server            | Purpose                                                 | Scope  | License    | Status   | Notes                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------- | ------------------------------------------------------- | ------ | ---------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `context7`        | Up-to-date library documentation                        | `both` | MIT        | in use   | Configured in `.mcp.json`. `@upstash/context7-mcp`, verified via `npm view`. Product counterpart: the Analyst reading docs the Coder cannot fetch                                                                                                                                                                                                                                  |
| `aiflow-rag`      | Semantic search over repo docs + filtered source        | `dev`  | MIT        | in use   | Ours: `apps/web/scripts/rag-mcp.ts` over product pgvector (`retrieveChunks`). SDK `@modelcontextprotocol/sdk@1.30.0` MIT (verified via package `license` field). Tools: `search`, `status`. Reindex: `yarn workspace @aiflow/web docs:ingest`. **Cursor loads this from `.cursor/mcp.json`** (not root `.mcp.json`, which is Claude Code). Dogfood path toward product Support Bot |
| `omniroute`       | Model routing                                           | `dev`  | MIT        | untested | In `.mcp.json` but not in `enabledMcpjsonServers`. Overlaps our own `model-router` — decide which owns routing before promoting it to `product`                                                                                                                                                                                                                                    |
| `filesystem`      | Read/write project files                                | `both` | unverified | untested | In product: sandbox working directory only, not the host FS                                                                                                                                                                                                                                                                                                                        |
| `postgres`        | Schema inspection, verifying `project_{uuid}` isolation | `both` | unverified | untested | In product the sandbox has **no** network path to the DB (see [12-open-questions.md](12-open-questions.md) #2) — usable only on the worker side                                                                                                                                                                                                                                    |
| `git` / `gitea`   | History, diffs, commits                                 | `both` | unverified | untested | Reviewer needs the diff; the spec currently fetches it via Gitea API ([08-prompt-reviewer.md](08-prompt-reviewer.md))                                                                                                                                                                                                                                                              |
| `docker`          | Sandbox lifecycle                                       | `dev`  | unverified | untested | In product the worker drives dockerode directly; an MCP layer is redundant                                                                                                                                                                                                                                                                                                         |
| `fetch` / `web`   | Reading library documentation                           | `both` | unverified | untested | In product: Analyst only. The Coder has no network ([07-prompt-coder.md](07-prompt-coder.md))                                                                                                                                                                                                                                                                                      |
| `jetbrains` (IDE) | Inspections, refactoring, build                         | `dev`  | Apache-2.0 | in use   | Connected in the current session. Does not ship — there is no IDE in production                                                                                                                                                                                                                                                                                                    |

### 1.1 Measured capability gaps

Not candidates someone proposed — capabilities the agent **tried to use and found
absent**, counted by `tools/session-analyzer` (`capabilityGaps`). A repeated call
to a nonexistent tool is the toolset stating a requirement, so it earns a row here
rather than a workaround ([17-session-review.md](17-session-review.md) § 3.6).

| Candidate    | Attempts | Scope | Verdict                                                                                                                                                                                                                                   |
| ------------ | -------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PowerShell` | 16       | `dev` | **Resolved 2026-08-04** — route documented below. Git Bash is the only shell; PowerShell is reached _through_ it. Three runs reported the same count of 16 because earlier entries recorded the absence without recording the replacement |
| `WebFetch`   | 15       | `dev` | **Unavailable.** 15 calls, 0 successes — domain verification fails, some calls refused for trust mode. Use `context7` for library docs, otherwise ask the user to paste content                                                           |
| `WebSearch`  | 16       | `dev` | **Unavailable.** 16 calls, 0 successes. Same mitigation                                                                                                                                                                                   |

**The PowerShell route.** Windows process and port operations go through
`powershell.exe -Command "…"` inside `Bash`. To stop a server holding a port:

```sh
powershell.exe -Command "Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id \$_ -Force }"
```

Two approaches that fail **silently** and were both tried first in task 1.2a:
`pkill -f "next dev"` exits 0 without killing anything, and filtering
`Get-Process` on `CommandLine` matches nothing.

### 1.2 Enforced rules (hookify)

Four rules in `.claude/hookify.*.local.md`, committed rather than gitignored
because they encode findings measured against this repo. They exist because
writing a rule into [17-session-review.md](17-session-review.md) demonstrably did
**not** change behaviour — the `cd`-prefix count rose from 290 to 332 in the run
after the rule was documented.

| Rule                           | Event  | Action  | Guards against                                                      |
| ------------------------------ | ------ | ------- | ------------------------------------------------------------------- |
| `block-bash-cd-prefix`         | `bash` | `block` | Relative `cd` in a Bash command — 34% of Bash calls, 18 path errors |
| `block-false-success-after-rm` | `bash` | `block` | `rm -f … && echo ok` — `rm -f` exits 0 on a missing path            |
| `warn-destructive-prisma`      | `bash` | `warn`  | `migrate dev` / `migrate reset` / `db push` offering a reset        |
| `warn-webfetch-unavailable`    | `all`  | `warn`  | `WebFetch` / `WebSearch`, 0 successes in 31 calls                   |

Verified 2026-08-04 by driving `hooks/pretooluse.py` directly with 12
representative payloads: both blocking rules returned `permissionDecision: deny`,
both warnings passed through, and eight legitimate commands (`yarn verify`,
`migrate deploy`, `rm -v` without a chain, `yarn workspace …`, `git log`) were
untouched.

Two implementation details worth knowing before editing a rule, both learned by
reading `core/`:

- The loader globs a **relative** `.claude/hookify.*.local.md`, so rules only
  load when the working directory is the repo root.
- `rule_engine.py` emits a `permissionDecision` only when the payload carries
  `hook_event_name`. A blocking rule tested without that field looks like a
  warning — which is exactly how the first self-test run misreported.

The hook fails open on any error, so a malformed rule is silently inert rather
than loud. Test after editing.

---

## 2. Skills

Skills are packaged instruction sets for a specific class of task.

| Skill                       | Purpose                                                                                                             | Scope     | License    | Status                 | Notes                                                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------- | ---------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js project scaffolding | Starter application template                                                                                        | `both`    | unverified | untested               | Directly tied to [12-open-questions.md](12-open-questions.md) #1: Aider is poor at creating multi-file structures from scratch. A templating skill is one possible answer |
| Prisma schema work          | Models, migrations, validation                                                                                      | `both`    | unverified | untested               | OQ #2 resolved 2026-08-07: validate in sandbox; apply via `db push` at deploy ([12-open-questions.md](12-open-questions.md))                                              |
| Diff review                 | Structural check of changes                                                                                         | `both`    | unverified | untested               | Overlaps the `reviewer` subagent — decide what is a skill and what is a prompt                                                                                            |
| docker-compose generation   | Deploy artifact assembly                                                                                            | `product` | unverified | untested               | Needed by the Deployer ([04-roadmap.md](04-roadmap.md), Task 4.3)                                                                                                         |
| `ai-studio-internals`       | Lazy-loaded context for rarely-needed AI Studio internals (ports, isolation, hardening, generated-code conventions) | `dev`     | ours       | verified               | Not a product candidate — a pure context-cost measure. Receives sections moved out of `CLAUDE.md`, which is billed on every turn of every session                         |
| `notes`                     | Capture an idea for later without acting on it — verbatim, expanded, critiqued                                      | `both`    | ours       | in use                 | Ours, no external dependency. Deliberately cannot develop: no Bash in `/note`'s tool cap. Product counterpart is the Analyst parking a request that is out of SPEC scope  |
| `session-report`            | HTML report of token/cache/subagent cost                                                                            | `dev`     | Apache-2.0 | in use                 | Anthropic's, run **unmodified** — cost only, no tool-flow data. Deliberately not forked; we wrote `tools/session-analyzer` alongside it (§ 8.3 of conventions)            |
| `find-skills`               | Discovering installable skills                                                                                      | `dev`     | unverified | rejected for `product` | Ships no LICENSE file. Also recommends by install count, not licence — unusable as a `product` gate. Fine for dev browsing; `/tool-scout` is the licence-aware path       |
| `frontend-design`           | Aesthetic direction for UI: typography, colour, motion, spatial composition                                         | `dev`     | Apache-2.0 | rejected — see § 2.1   | Anthropic's, in `claude-plugins-official`. Licence verified via the plugin's own `LICENSE`. Rejected on **content**, not licence — it contradicts `09-ui-spec.md` § 9     |

**Observation.** AI Studio's roles are structurally close to skills: the Analyst is an interviewing skill, the Coder a change-application skill. A skill that works well here likely transfers into the product with little rework. That is the main reason to keep this registry from day one.

### 2.0 Cloud Agent personal skills (repo-vendored)

Desktop Cursor loads `~/.cursor/skills/` globally; **Cloud Agent VMs do not**. As of
2026-08-31 the owner's personal catalog is **committed in-repo** so cloud sessions
match desktop:

| Location                   | Contents                                                |
| -------------------------- | ------------------------------------------------------- |
| `.cursor/skills/`          | Primary — Cloud Agents read this on checkout            |
| `.claude/skills/`          | Mirror for Claude Code (project skills + vendored copy) |
| `.cursor/rules/`           | Global rules (`docs-autopilot`, `solo-notebook`)        |
| `.cursor/commands/`        | Global slash command (`docs-autopilot`)                 |
| `.cursor/environment.json` | Cloud env manifest                                      |

Sources merged: `~/.agents/skills`, `~/.cursor/skills`, Cursor `skills-cursor`,
Atlassian plugin skills. Project-native skills (`ai-studio-internals`, `notes`) stay
authored under `.claude/skills/` only. **Maintenance:** after editing a skill on
desktop, re-copy into `.cursor/skills/` (and mirror to `.claude/skills/` if needed)
before pushing — there is no auto-sync yet. Alternative long-term: branch
`cursor/cloud-agent-tools-sync-4b1a` adds `tools/cloud-agent-sync/` for git-remote
pull on boot instead of vendoring.

### 2.1 `frontend-design` — allowlisted licence, rejected on content

Searched 2026-08-04 via `/tool-scout` for a design tool that would make mockups
good from the start. `frontend-design` is the obvious candidate: Anthropic's own,
in the official marketplace, Apache-2.0 (verified in the plugin's `LICENSE`, not
a README badge). It passes § 8 mechanically.

**It was still rejected, because its instructions contradict our UI spec:**

| `frontend-design/SKILL.md`                                        | [09-ui-spec.md](09-ui-spec.md) § 9 |
| ----------------------------------------------------------------- | ---------------------------------- |
| "NEVER use ... overused font families (**Inter**, Roboto, Arial)" | "Font: **Inter** (system)"         |
| "Pick an extreme: maximalist chaos, brutalist/raw ...", "BOLD"    | "**minimalist** design"            |
| "Vary between light and dark themes"                              | "**Light theme** by default"       |

The skill is built for memorable one-off landing pages. Our UI is a product
surface with two personas and eight screens, where consistency is the point. A
licence check would not have caught this — worth remembering that § 8 gates
whether a tool is _usable_, not whether it is _appropriate_.

**Recorded so the next session does not re-litigate it.** If a bold aesthetic is
ever wanted, the conflict is with § 9 of the UI spec, and that is a design
conversation to have first.

### 2.2 UI library survey (same search)

Licences verified via `npm view <pkg> license`, not badges. All are on the § 8
allowlist, so any of them _could_ ship; the reasons for not adopting them are
engineering, not legal. Recorded because the search should not be repeated.

| Candidate                   | SPDX       | Scope     | Verdict                                                                                                                                                                                                                                        |
| --------------------------- | ---------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shadcn` (CLI)              | MIT        | `both`    | allow, **not adopted** — templates assume React 19 and generate into an app, not a workspace package. Patterns adopted by hand instead (Task 1.2d)                                                                                             |
| `@radix-ui/*`               | MIT        | `both`    | allow — the likely path when Modal/Toast/Tabs arrive                                                                                                                                                                                           |
| `class-variance-authority`  | Apache-2.0 | `both`    | allow — was used for Button variants in Task 1.2d; dropped when Button became an OpenUI wrapper (D0a)                                                                                                                                          |
| `tailwind-merge`, `clsx`    | MIT        | `both`    | **in use** — `cn()` in `packages/ui/src/lib/cn.ts`                                                                                                                                                                                             |
| `lucide-react`              | ISC        | `both`    | allow, not yet needed — no icons in the four primitives                                                                                                                                                                                        |
| `tw-animate-css`            | MIT        | `both`    | allow, not needed — v4 ships `animate-spin`                                                                                                                                                                                                    |
| `@tailwindcss/forms`        | MIT        | `both`    | allow, not adopted — `Input` styles the two fields we have directly                                                                                                                                                                            |
| `daisyui`                   | MIT        | `both`    | allow, rejected — class-based components collide with owning our own                                                                                                                                                                           |
| `@headlessui/react`         | MIT        | `both`    | allow, rejected — Radix is the stronger option if we need headless                                                                                                                                                                             |
| `storybook`                 | MIT        | `dev`     | allow (dev only), deferred — four primitives do not justify the wiring                                                                                                                                                                         |
| `@openuidev/react-ui`       | MIT        | `product` | **adopted 2026-08-07** — product component foundation for `apps/web` only (D0a). Verified via `npm view` + upstream LICENSE. Peers `react-lang` / `react-headless` also MIT. Not shipped into generated user apps; GenUI chat library deferred |
| `@openuidev/react-lang`     | MIT        | `product` | **adopted** as peer of `react-ui` (Renderer / library types). Full OpenUI Lang streaming in Researcher chat is a later task                                                                                                                    |
| `@openuidev/react-headless` | MIT        | `product` | **adopted** as peer of `react-ui` (chat state primitives). Researcher still uses `@assistant-ui/react` until a deliberate chat migration                                                                                                       |

---

## 3. Subagents

Definitions live in [`.claude/agents/`](../.claude/agents/), and they fall into two groups.

**The four role agents with production prompts are mirrors of `docs/05`–`08`.** Copied verbatim — a modified prompt tests nothing about the version that ships. These have a `Prompt source`. Deployer has no prompt file yet (T3).

**The three dev-only agents below the divider are ours.** They mirror nothing, ship nowhere, and exist to make mechanical work cheap. They run on the free local slot (see § 5) and hold read-only tools by design.

| Subagent      | Role     | Prompt source                                  | Tools                               | Scope     | Status                                                                | Tested on                             |
| ------------- | -------- | ---------------------------------------------- | ----------------------------------- | --------- | --------------------------------------------------------------------- | ------------------------------------- |
| `analyst`     | Analyst  | [05-prompt-analyst.md](05-prompt-analyst.md)   | Read, Write, WebSearch, WebFetch    | `both`    | tested — defects found                                                | 2026-08-02, AI Studio dogfooding SPEC |
| `planner`     | Planner  | [06-prompt-planner.md](06-prompt-planner.md)   | Read, Glob, Grep                    | `both`    | tested — defects found                                                | 2026-08-02, same SPEC, MVP-0 slice    |
| `coder`       | Coder    | [07-prompt-coder.md](07-prompt-coder.md)       | Read, Write, Edit, Bash, Glob, Grep | `both`    | tested                                                                | 2026-08-05–07, `/orchestrate` + MVP-1 |
| `reviewer`    | Reviewer | [08-prompt-reviewer.md](08-prompt-reviewer.md) | Read, Glob, Grep, Bash              | `both`    | tested — product role deferred to MVP-2; still used by `/orchestrate` | 2026-08-05–07, `/orchestrate`         |
| `deployer`    | Deployer | **missing**                                    | —                                   | `product` | no prompt                                                             | —                                     |
| —             | —        | —                                              | —                                   | —         | —                                                                     | —                                     |
| `classifier`  | —        | none (dev-only)                                | Read, Grep, Glob                    | `dev`     | untested                                                              | —                                     |
| `doc-checker` | —        | none (dev-only)                                | Read, Grep, Glob                    | `dev`     | untested                                                              | —                                     |
| `lang-lint`   | —        | none (dev-only)                                | Read, Grep, Glob                    | `dev`     | untested                                                              | —                                     |

**Gap: the Deployer has no prompt.** The role is declared in [01-system-spec.md](01-system-spec.md) § 2.3 and in the roadmap (Task 4.3), but no `prompt-deployer` document exists. The subagent was deliberately not created — writing a prompt "in the spirit of" the spec would mean inventing specification content. Deferred by decision: revisit once local MVP development is judged satisfactory. Tracked as T3 below.

**Mirror hygiene (T2):** `docs/05`–`08` are source of truth. `.claude/agents/{analyst,planner,coder,reviewer}.md`
bodies match except for relative doc links and a trailing «mirror note» footer in the agent
file. The `coder` agent YAML `description` still says «and commits» — misleading (runner
commits; the Coder never does). Fix the frontmatter when editing agents; do not treat
description drift as prompt drift.

**Permission rationale.** The Reviewer deliberately has no write access: it issues a verdict, it does not fix code — matching the ACCEPTED/REJECTED loop in [08-prompt-reviewer.md](08-prompt-reviewer.md). The Planner is read-only: its output is JSON, not files. The Coder is the only one with full write and command execution.

The three dev-only agents are read-only for a different reason: they run on a locally-served model. A weaker model with write or exec rights is a bad trade at any price — it reports, the caller applies. This is a standing rule for the free slot, not a per-agent judgement.

**What belongs on the cheap slot.** Mechanical work with a closed answer set: sorting into known buckets, checking a claim against a file, scanning for a character range. Not: anything producing prose a human reads, anything where a plausible-but-wrong answer is expensive to detect, anything driving `Edit` (exact string matching — a weak model retries, and retries cost more than the downgrade saves).

---

## 4. Prompt test log

The core value of this registry. Every subagent run during development is a free test of a prompt that later ships. Not recording the result wastes the run.

**Note (2026-08-07):** Product LLM Reviewer is **deferred to MVP-2** (slim MVP-1 gate = sandbox checks — `docs/12-open-questions.md` #7). Dev-time `/orchestrate` may still drive the `reviewer` subagent; keep logging those runs here.

**Format:** append-only, absolute dates (`YYYY-MM-DD`), prompt version = commit or edit date of the source document.

| Date       | Role                                            | Prompt version                          | What was tested                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | What to change                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------- | ----------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-02 | Analyst                                         | `05-prompt-analyst.md`, rev. 2026-08-02 | Generating `SPEC.md` for AI Studio itself from `docs/` supplied as RAG context (dogfooding). Interview stages not exercised — a subagent has no channel to the end user, so only the generation half of the role was covered                                                                                                                                                                                                                                                   | Template followed and headings correct, but the shape fought the content: no home for background processes (queues, sandbox lifecycle, checkpointing) so they were forced into "Agents and automation"; no iteration field, so `(MVP-0)`/`(MVP-1)` were invented inline; `**URL**` and screen states added unprompted, breaking "follow the template exactly". Found five real model gaps — `Task` dependencies, `User` role, `Specification` approval, `ChatMessage` fields, pgvector placement                                                                                                                                                                                                                                                                  | Add a section for background processes and a structured `scope` field; add `URL` and `States` to the screen block; give `[Element type]` a fixed vocabulary; split human roles from internal AI roles                                                                                                                                                                                                   |
| 2026-08-02 | Planner                                         | `06-prompt-planner.md`, rev. 2026-08-02 | Decomposing the Analyst's AI Studio `SPEC.md` (above) into the MVP-0 task array                                                                                                                                                                                                                                                                                                                                                                                                | 54 tasks, valid JSON, dependencies ordered, correctly refused to invent a `Task` dependency relation the schema lacks. Confirmed the Analyst's prediction only halfway: `**URL**` helped rather than broke parsing, but inline `(MVP-0)` markers required scanning every Logic paragraph and are one typo away from mis-scoping. Output hit the response limit at 54 tasks — the JSON array is too large to return alongside anything else                                                                                                                                                                                                                                                                                                                        | Add `status`, `effort`, and a `needsConfirmation`/`deviations` flag (it invented `User.role`, `Specification.approvedAt`, `packages/crypto` with no way to signal them); distinguish hard from soft dependencies; drop the "2–3 files" rule for infrastructure tasks; the CRUD-only example does not cover queues, proxies, or Docker; add an instruction for what to do when the spec is contradictory |
| 2026-08-05 | Analyst, Planner, Coder, Reviewer (full cycle)  | `05`–`08` rev. 2026-08-02               | End-to-end pipeline test on Task 1.3 (Researcher chat). Analyst produced `SPEC.md` from RAG-style doc context (no live interview — relayed questions through the orchestrator); Planner decomposed it into a 14-task JSON array with a correct dependency graph; Coder implemented the schema-change task (`tokensIn`/`tokensOut` on `ChatMessage`) and the orchestrator ran `yarn verify` (90 tests green); Reviewer returned `ACCEPTED` JSON against the acceptance criteria | All four roles produced usable output and the loop closed. **Analyst**: caught six real cross-document gaps and asked sharp clarifying questions, but the GLM model intermittently injected non-target-language words (Chinese `新增`, Spanish `pequena`) into Russian prose — required manual cleanup, and the generated `SPEC.md` failed `yarn verify`'s Prettier stage until formatted. **Planner**: clean 14-task plan, correct topological order, honoured the 2–3-files rule by splitting mock/live provider paths, placed tests next to the code they cover — no change needed. **Coder**: minimal on-target diff, updated the model comment, did not commit (honoured policy). **Reviewer**: verified claims against the actual files, emitted clean JSON | Analyst prompt needs an explicit "do not mix in words from languages other than the user's and English" clause; run `lang-lint` + `yarn format` on Analyst artifacts before the gate. Planner and Reviewer need no changes. Formalised the loop as `/orchestrate` (`/.claude/commands/orchestrate.md`) so the cycle is repeatable without re-deriving the procedure each session                        |
| 2026-08-06 | Analyst, Planner, Coder, Reviewer + T6          | `.claude/agents/*` → `05`–`08`          | Local LM Studio (`qwen/qwen3-coder-30b`) via OmniRoute (`local/qwen/qwen3-coder-30b`). Tiny hello-cli demo: skip-interview SPEC → 1-task PLAN → `index.js` → Reviewer JSON. Artifacts in `specs/lmstudio-flow-demo/`. Also: product RAG dim 768 + `docs:ingest` over `docs/*.md`                                                                                                                                                                                               | **T6 confirmed**: `POST /v1/messages` returned `T6_OK`. Full four-role cycle on local Qwen closed with Reviewer `ACCEPTED`. Analyst SPEC ~2.3k chars; Planner emitted a 1-task JSON array; Coder wrote `console.log('Hello, AIFlow!')`. Settings aliases temporarily pointed at LM Studio (backup `settings.json.bak-before-lmstudio`)                                                                                                                                                                                                                                                                                                                                                                                                                            | None for prompts. Restore paid-slot aliases when done testing. Keep `docs:ingest` as the local RAG bootstrap path                                                                                                                                                                                                                                                                                       |
| 2026-08-07 | Analyst, Planner, Coder, Reviewer (orchestrate) | `.claude/agents/*` + `/orchestrate`     | Autonomous Cursor orchestrate for roadmap Tasks **2.2** + **2.3** (full MVP-0 tail). Skip-interview SPEC → PLAN → Coder→gate→Reviewer with `run the whole plan`. Artifacts: `specs/task-2.2-editor-gitea/`, `specs/task-2.3-deploy-modelconfig/`. Branches `task/2.2-editor-gitea` → `task/2.3-deploy-modelconfig`                                                                                                                                                             | Both plans closed `DONE`. **2.2**: Gitea client, create saga, Monaco editor, WS via custom `server.ts`, 177→ then 207 tests. **2.3**: `@aiflow/crypto`, ModelConfig, `@aiflow/queue`, worker `deploy:run`+dockerode (dev sock), deployments UI. Host `yarn verify` still fragile on Prisma generate EPERM when DLL locked; compose/`tsc` + `yarn test` green. Reviewer used selectively early; later batches relied on eslint/test gate + orchestrator mechanical lint fixes                                                                                                                                                                                                                                                                                      | Prefer smaller Coder batches when pre-commit `--max-warnings 0` catches size/unsafe-any; keep custom Next server documented in code-map; treat Prisma Windows EPERM as env, not schema failure                                                                                                                                                                                                          |
| 2026-08-07 | Coder (parallel agents; slim MVP-1)             | product prompts + Task SPECs 3.1–3.3    | Roadmap Tasks **3.1** (sandbox + `registry-proxy`), **3.2** (Planner / `plan:generate`), **3.3** (Coder / `code:execute`) implemented via parallel coder agents. Artifacts: `specs/task-3.1-sandbox-infra/`, `specs/task-3.2-planner/`, `specs/task-3.3-coder/`; narrow dogfood checklist `specs/slim-mvp1-dogfood/`                                                                                                                                                           | Unit coverage green for plan parse, queue payloads, dry-run/live handlers, sandbox options, registry allowlist. Product gate = sandbox checks (no LLM Reviewer). Live compose dogfood remains operator-driven per checklist.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | None for prompts from this batch. Keep MVP-2 Reviewer/Support/domain/full-dogfood deferred; log live dogfood outcomes when run                                                                                                                                                                                                                                                                          |
| 2026-08-07 | Analyst–Reviewer (pattern mining)               | `05`–`08` + § 8 external sources        | Applied open-source pattern mining (Spec Kit / BMAD / MetaGPT / bolt.diy — MIT or reference-only) into docs without vendoring runtimes: Analyst Non-goals/Success metrics/`[NEEDS CLARIFICATION]`/language purity; Planner ≤24 task cap + `effort`; Coder sandbox core aligned with docs/07; Reviewer `confidence` + severity/`sandbox∧AC` policy (MVP-2)                                                                                                                      | Docs + `.claude/agents` mirrors + `planner-prompt.ts` / `planner.ts` / `runner.js` updated. Prompt content changes; full four-role LLM re-run not part of this edit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Re-run `/orchestrate` smoke when convenient; keep leaked proprietary prompts out of product                                                                                                                                                                                                                                                                                                             |

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

| Role       | Why it stays                                                                                                                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `analyst`  | Interview + RAG reconciliation, user-facing prose, largest context demand                                                                                                               |
| `planner`  | Historically truncated at 54 tasks (§ 4); now capped at 24 (`PLANNER_MAX_TASKS`) with parser enforcement. Output is still strict JSON — a weaker model worsens parse/structure failures |
| `reviewer` | Security judgement. A false `ACCEPTED` costs a debugging cycle — more than the tokens saved                                                                                             |
| `coder`    | Mechanical in scope but drives `Edit`; a weak model retries                                                                                                                             |

### Availability caveat

The free slot depends on LM Studio running locally. If it is down, a `model: haiku` agent **fails** — the router cannot reach the backend. That is the correct behaviour: a silent fallback to the paid slot would hide the cost it was meant to avoid. Treat a free-slot agent as unavailable, not as slow.

**Verified 2026-08-06 (T6):** `POST http://localhost:20128/v1/messages` with
`model: local/qwen/qwen3-coder-30b` returned `T6_OK` from LM Studio. The four
role agents were then driven through the same bridge on a tiny hello-cli demo
(`specs/lmstudio-flow-demo/`) — Analyst → Planner → Coder → Reviewer
`ACCEPTED`. Routing is observed, not inferred.

### Escalation — the product-side counterpart

Anthropic's `advisor` tool (cheap primary, stronger model consulted at decision points) does not work in this setup: it requires the direct Anthropic API, while `ANTHROPIC_BASE_URL` points at a router that does not forward requests intact, and the pairing check rejects unrecognized model names. Not attempted.

The _pattern_ is worth having inside AI Studio, where we own the router. Tracked
as question #9 in [12-open-questions.md](12-open-questions.md), now **scheduled
at MVP-3 task C3** ([04-roadmap.md](04-roadmap.md) § 5): `model-router` becomes a
real runtime, escalation is a second routed request at worker-decided trigger
points (before planning, on repeated failure, before marking complete), with an
`advisor` per role in `ModelConfig.config`. The "keep the router from foreclosing
it" stance above holds until C3 ships.

---

## 5a. LLM observability — Langfuse (MVP-3 B1–B4 shipped)

MVP-3 adds a single observability layer for every LLM role
([04-roadmap.md](04-roadmap.md) § 5, tracks B1–B4; decision E2 in
[14-decisions-needed.md](14-decisions-needed.md)).

**B1 (2026-08-23):** Langfuse v3 self-host in `docker-compose.yml` —
`langfuse-web` (host **3100**), `langfuse-worker`, dedicated `clickhouse` +
`langfuse-redis`, OLTP DB `langfuse` on shared Postgres, MinIO bucket via
`docker/minio/ensure-langfuse-bucket.sh`. Licence: Langfuse is MIT (OSS). Dev
seed user/keys via `LANGFUSE_INIT_*` in `.env.example`. Existing Postgres
volumes need a one-shot `CREATE DATABASE langfuse;`.

**B2 (2026-08-23):** wrapper over `createOpenAICompatibleProvider` in
`packages/ai-roles` — traces prompt/tokens/latency/errors for Analyst/Planner/
Reviewer (and embeddings). Env: `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY`
(+ optional `LANGFUSE_BASE_URL`); unset → noop. Compose app/worker point
`LANGFUSE_BASE_URL` at `http://langfuse-web:3000`. Workers set
`runWithTraceContext({ role, projectId, taskId })`; Reviewer appends
`langfuseTraceId=` to `TaskLog`. `AuditEvent` cross-link → A3. Sandbox Aider
calls are out of this wrapper.

**B3 (2026-08-23):** `tools/evals` golden SPEC→plan→code suite + prompt-contract
regression (`yarn evals`). Offline fixtures by default; `EVALS_LIVE=1` for a
live Planner call. Optional Langfuse boolean scores on the same ingestion API
(noop without keys). CI: `.github/workflows/evals.yml` on
`.claude/agents/**` / sandbox coder / planner+reviewer / `tools/evals/**`.

**B4 (2026-08-23):** untrusted RAG wrap + `allowMutatingTool` guard in
`packages/ai-roles` (`rag-safety.ts`); worker `executeTool` blocks write tools
when RAG looks injected without explicit user intent; red-team cases in
`tools/evals` (`scoreRedTeam`) on the same `yarn evals` / CI path.

---

## 6. Slash commands

Commands live in [`.claude/commands/`](../.claude/commands/). They are the cheapest mechanism available: nothing enters context until invoked, and each can pin its own model. Mechanical workflows belong here rather than in `CLAUDE.md`, which is billed on every turn whether or not it is relevant.

| Command                    | Purpose                                                                                                                                        | Scope | License | Status   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------- | -------- |
| `/verify`                  | Runs `yarn verify` and reports the first failing gate                                                                                          | `dev` | ours    | untested |
| `/task-start <id> <slug>`  | Branch per [15-engineering-conventions.md](15-engineering-conventions.md) § 1.1, plus the roadmap checklist and any blocking open questions    | `dev` | ours    | untested |
| `/state-sync`              | Checks whether the state files in `CLAUDE.md` have fallen behind; delegates the scan to `doc-checker`                                          | `dev` | ours    | untested |
| `/note <idea>`             | Captures an idea into `notes/` without interrupting the current task; expansion runs in a background subagent                                  | `dev` | ours    | in use   |
| `/session-review [window]` | Runs `tools/session-analyzer` and writes a tool-flow retrospective to `reports/`                                                               | `dev` | ours    | in use   |
| `/tool-scout <need>`       | Finds MCP servers / skills / agents for a need and returns an SPDX licence plus an allow/deny verdict per § 8                                  | `dev` | ours    | untested |
| `/orchestrate <plan.json>` | Runs a Planner-produced task array through the Coder → gate → Reviewer loop, committing each accepted task and marking plan statuses           | `dev` | ours    | tested   |
| `/refactor [slug]`         | Timeboxed 90-min behaviour-preserving refactor pass at a task boundary — code-shape + state-file drift sweep, reports then commits on approval | `dev` | ours    | tested   |

`/state-sync` is the pattern worth copying: the expensive model reads a summary, the free model does the file-by-file work. `/orchestrate` is the counterpart for the codegen pipeline: it is the dev-time stand-in for the production `code:execute` queue + runner — a disciplined, mechanical loop that drives the four role agents over a plan, keeps the plan file as a resume checkpoint, and commits on `ACCEPTED`. The main agent orchestrates (it can call subagents and talk to the user, which a subagent cannot), so there is no `orchestrator.md` agent definition — the command is the prompt. `/refactor` closes the task-boundary loop: the mechanical code-shape sweeps (oversized files, circular imports, dead exports) are cheap and rarely find anything in a hard-gated codebase, so its real value is the state-file drift sweep — code map and AGENTS.md falling behind what shipped. It reports first and commits only on approval, and its contract is the test count: a refactor that changes a test expectation has left refactor territory.

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

### T6. Confirm the free slot actually routes free — RESOLVED 2026-08-06

Verified: OmniRoute → LM Studio `local/qwen/qwen3-coder-30b` (`POST /v1/messages` → `T6_OK`) plus a four-role hello-cli cycle. Details in § 5 and the 2026-08-06 prompt test log row. Free-slot agents still fail loudly if LM Studio is down (no paid fallback).

### T7. Whether the tool-flow findings should feed the product

`tools/session-analyzer` now measures what the agent calls, where it fails, and what it reaches for and cannot find. AI Studio runs the same loop for user projects, so the same instrumentation would answer "is the Coder struggling" with data instead of anecdote.

Open because the shape is not obvious: `TaskLog` currently checkpoints task-level progress, and tool-level telemetry is a schema change plus a decision about retention.

Options:

- Extend `TaskLog` with per-tool outcomes and reuse the taxonomy (including the `ourProblem` split — a task that failed because the model router was down must not be re-planned as if the code were wrong).
- Keep it dev-only; the product's failure modes are different enough that shared code would be a false economy.
- Emit the analyzer's JSON shape from the sandbox runner and analyze it out of band.

**Affected artifacts:** [03-data-model.md](03-data-model.md) (`TaskLog`), [11-sandbox.md](11-sandbox.md), `tools/session-analyzer`

---

## 8. External prompt sources (pattern mining)

Our production prompts live in [05](05-prompt-analyst.md)–[08](08-prompt-reviewer.md). We do **not** vendor foreign orchestrators. We mine patterns into those docs (and the trimmed Planner/Coder runtime prompts), then re-test via the log in § 4.

### Selection rules

- Prefer MIT / Apache-2.0 / BSD / ISC sources when copying phrasing into product prompts (`scope: product` / `both` — conventions § 8).
- “Leaked” system-prompt catalogs are **reference only** (tool-loop shape, refusal, output contracts). Do not paste Cursor / Claude Code / v0 / Lovable / proprietary agent text into `packages/ai-roles`, sandbox runners, or `docs/05`–`08`.
- Keep our queues, sandbox gate, soft-delete, and language policy. Extra personas (Architect, Scrum Master, UX) wait until slim MVP-1 Planner+Coder is stable.
- Deployer stays deterministic code (T3) — no LLM prompt pack.

### Role → open sources map

| Our role         | Primary open sources                                                                                                                                                                                         | Steal                                                                                           | Leave behind                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Analyst          | [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) (MIT) interview/PRD skills; [github/spec-kit](https://github.com/github/spec-kit) `/specify` + clarification markers; MetaGPT ProductManager SOP | Non-goals / success metrics; never invent; one-question facilitation; hybrid SPEC               | Full BMAD agent swarm; MetaGPT competitive-analysis digressions |
| Planner          | Spec Kit `/plan`+`/tasks`; MetaGPT ProjectManager; prompt-builder↔JSON-parser split (e.g. Multi-Agent-Automation-Engine)                                                                                     | Strict JSON + validate/retry (C3); DAG deps; refuse on contradiction; **batch/cap** large plans | One-shot 50+ task dumps that blow context                       |
| Coder            | [bolt.diy](https://github.com/stackblitz-labs/bolt.diy) (MIT) stack constraints; OpenHands / Aider / Cline open loops                                                                                        | Atomic task; no-commit (runner commits); report-then-stop; size limits                          | Monolithic “build the whole app in one chat”                    |
| Reviewer (MVP-2) | MetaGPT QaEngineer; Forge-style `qa-reviewer`; confidence + security block lists                                                                                                                             | Structured verdict + AC evidence; severity; sandbox-green ∧ AC                                  | LLM-only blocking gate without sandbox checks                   |

### Closest end-to-end philosophies

1. **GitHub Spec Kit** — structural twin (`specify → plan → tasks → implement`); best template/clarification patterns.
2. **BMAD-METHOD** — best Analyst facilitation and “artifact approved before code”; too heavy as a runtime.
3. **MetaGPT / ChatDev** — classic software-company SOPs; weaker for non-technical, user-language interview.
4. **bolt.diy** — Coder/UI generation patterns under Next/TS; proprietary app-builder leaks are inspiration only.
5. **Awesome / leaked catalogs** — checklists for tool protocol and schema-first output, not drop-in packs.

### Adoption backlog (applied into docs/05–08)

| Phase | Focus                                                                         | Status             |
| ----- | ----------------------------------------------------------------------------- | ------------------ |
| A     | Analyst: Non-goals, Success metrics, `[NEEDS CLARIFICATION]`, language purity | Applied 2026-08-07 |
| B     | Planner: task cap / batching, optional `effort`, stronger JSON contract       | Applied 2026-08-07 |
| C     | Coder: sandbox `buildPrompt` aligned with docs/07 core                        | Applied 2026-08-07 |
| D     | Reviewer (MVP-2 prep): confidence + severity policy                           | Applied 2026-08-07 |

---

## Question status

| #   | Question                            | Status                                                                                                                           |
| --- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Coder: Claude Code or Aider         | Open                                                                                                                             |
| T2  | Prompt mirror sync                  | Open                                                                                                                             |
| T3  | Deployer prompt                     | Deferred (post-MVP local)                                                                                                        |
| T4  | User-facing tooling                 | Open — licence policy now settled (conventions § 8), set not                                                                     |
| T5  | Enforcing the language policy       | Open — `lang-lint` built, not wired into a gate                                                                                  |
| T6  | Verify free-slot routing end to end | **Resolved 2026-08-06** — OmniRoute → LM Studio messages probe + four-role cycle on `local/qwen/qwen3-coder-30b` (see § 4 / § 5) |
| T7  | Tool-flow telemetry in the product  | Open — analyzer built dev-side, product shape undecided                                                                          |
