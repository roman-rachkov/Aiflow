---
description: Analyze the tool flow of recent sessions and write a retrospective to reports/
argument-hint: [7d|24h|30d|all]
allowed-tools: Read, Write, Glob, Grep, Bash(yarn workspace @aiflow/session-analyzer analyze:*), Bash(npx tsx tools/session-analyzer/src/cli.ts:*)
---

Analyze recent sessions and write a retrospective: what was done, where the tool
flow went wrong, and what the toolset is missing.

Window: **$1** (default `7d` if empty).

**1. Run the analyzer.**

```sh
npx tsx tools/session-analyzer/src/cli.ts --since ${1:-7d} --out reports/.session-analysis.json
```

It deduplicates forked sessions by entry `uuid`, pairs every `tool_use` with its
`tool_result`, classifies errors, and detects thrash, anti-patterns and
capability gaps. The output is aggregated, so reading it costs little.

**2. Read `reports/.session-analysis.json`.** Do not re-derive anything the script
already computed — no grepping transcripts, no counting by hand.

**3. Write `reports/<YYYY-MM-DD>-session-review.md`.** In English (an internal
artifact, per the language rule in `CLAUDE.md`). Four sections:

- **What was done** — from the `sessions[]` slugs and branches, one line each.
- **Where the flow went wrong** — and this is the part that has to be right:
  **report `ourErrors` and `environmentErrors` separately, never a single error
  rate.** The classifier being unavailable is roughly half of all failures here
  and no change on our side fixes it. A flat number reads as a broken workflow and
  buries the failures that are actionable. Lead with the `ourProblem: true`
  buckets, ranked by count; mention the environmental share once, as context.
- **What the toolset is missing** — from `capabilityGaps` and `antiPatterns`. A
  repeated call to a nonexistent tool is a requirement, not a mistake.
- **Fixes** — one concrete, actionable change per finding. No general advice.

**4. Report the path in one line.** Do not paste the report back.

**Then, if a finding is durable** — a rule rather than an observation about one
session — add it to `docs/17-session-review.md` and say you did. That file is what
the next session reads; `reports/*.md` is the raw material it comes from.

**Note on delegation.** Unlike `/state-sync`, this command does _not_ hand off to
the free local slot. The mechanical aggregation is already done by the script, and
what remains is the judgement about which gaps matter — the part worth paying for.
Do not "optimize" this into a `doc-checker` call; see `docs/13-agent-tooling.md`
§ 6.
