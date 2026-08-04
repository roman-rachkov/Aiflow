---
description: Check whether the project's state files are behind the code, via the cheap doc-checker agent
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Read, Glob, Grep, Agent
---

Check whether this project's state files still match reality.

`CLAUDE.md` sets the rule these files exist to serve: every task should start from documented state, not from a fresh sweep of the repo. When a state file falls behind, the next session re-explores — or worse, acts on a stale claim with confidence.

**What changed recently:**

- !`git status --short`
- !`git log --oneline -10`

**Delegate the scan.** Launch the `doc-checker` agent over these files. It runs on the cheap local slot, so the mechanical claim-by-claim verification costs almost nothing; only its findings come back into this context.

Targets, per the state-file table in `CLAUDE.md`:

| File                                     | Owns                                            |
| ---------------------------------------- | ----------------------------------------------- |
| `CLAUDE.md`                              | architectural invariants, commands, conventions |
| `docs/12-open-questions.md`              | open question status table                      |
| `docs/13-agent-tooling.md`               | MCP servers, skills, subagents, prompt test log |
| `docs/14-decisions-needed.md`            | resolved vs pending decisions                   |
| `docs/15-engineering-conventions.md` § 7 | the stale-documents table                       |
| `docs/16-code-map.md`                    | package and slice layout                        |
| `docs/README.md`                         | the index table                                 |

**Then report, grouped by file:** what is stale, what the repository actually shows, and the one-line edit that would fix it. Rank by how likely a stale claim is to mislead the next session — a wrong command or a wrong "this does not exist" is worse than a stale prose summary.

If everything checks out, say so in one line. A clean result is the expected outcome most of the time, and padding it is a disservice.

Do not fix anything. This command reports; the edits are a separate decision, and they belong in the same commit as whatever change made them necessary.
