---
description: Find MCP servers, skills, agents or templates for a need — with a licence verdict, not a guess
argument-hint: <what you need the tool to do>
allowed-tools: WebSearch, WebFetch, Read, Glob, Grep, Bash(npm view:*)
---

Find tooling for: **$ARGUMENTS**

This is a **licence-gated** search. AI Studio is a commercial product, so a
candidate's licence is part of whether it is usable at all, not a footnote — the
policy is § 8 of `docs/15-engineering-conventions.md`, and it is asymmetric:
`scope: dev` only needs the licence recorded, `scope: product` or `both` must be
on the allowlist.

**1. Check what we already have first.** Read `docs/13-agent-tooling.md` and
`.mcp.json`. A candidate already in the registry needs no search, and a rejected
one needs no re-litigating.

**2. Search.** Prefer, in order: the official marketplace
(`anthropics/claude-plugins-official`), then well-known sources, then general
search. Note that the built-in `find-skills` skill ranks by install count and
says nothing about licences — useful for discovery, useless as a gate.

**3. Verify the licence — do not infer it.** For each candidate, read the actual
LICENSE file or the package's own `license` field (`npm view <pkg> license`).
A badge in a README is not verification. Record _which_ source you checked.

**4. Report a table**, one row per candidate:

| Candidate | What it does | Source | SPDX licence | Verified via | Proposed scope | Verdict |

The verdict follows § 8 mechanically:

- `scope: dev` → `allow (dev only)` once the licence is recorded, whatever it is.
  It does not ship, so it cannot oblige us.
- `scope: product|both` → `allow` only for MIT, Apache-2.0, BSD-2/3, ISC, 0BSD,
  Unlicense. Otherwise `deny`, naming the licence.
- No LICENSE file, or a licence you could not confirm → **`deny — licence
unverified`**. Never soften this into "probably MIT". Silence is a rejection,
  not a permissive default.

Flag AGPL explicitly when you see it: it is the one that looks harmless in
development and becomes a publish-your-source obligation once a tool sits in the
product's compose file serving users over a network.

**5. Recommend one**, or state plainly that nothing passes. "Nothing usable"
is a real and useful answer here — better than a candidate we have to rip out
after writing code against it.

**6. Append what you found to `docs/13-agent-tooling.md`** with `Status: untested`
and the licence column filled. A search whose result is not recorded will be
repeated by the next session, which is the specific waste `CLAUDE.md` exists to
prevent.

Do not install anything. Discovery and adoption are separate decisions, and
adoption is the user's.
