---
date: 2026-08-04
status: idea
source_language: en
---

# `next build` fails on Windows with EPERM on `Application Data`

## Verbatim note

> `next build` fails on Windows with EPERM scandir 'C:\Users\rak1\Application Data' — PRE-EXISTING, not caused by the Tailwind v4 upgrade. Verified 2026-08-04 by stashing the v4 changes and rebuilding on the v3 baseline: fails identically. Reproduces with --no-lint, so it is not the ESLint-during-build step. `next dev` works fine and serves correct CSS; only the production build is affected. Tried and did NOT fix it: outputFileTracingRoot pinned to the monorepo root (reverted, since the comment would have claimed a fix that did not happen). 'Application Data' is a legacy junction in the user profile, so some glob is walking up from the repo into C:\Users\rak1. Impact: `yarn verify` passes (it does not build), so CI as specified stays green, but nobody can produce a production build on this machine. Needs its own task before deploy work (roadmap phase 4).

(Note authored in English — it is a technical defect record, not user-facing prose.)

## Expanded idea

The finding is a defect report, so the variants are about _where the fix belongs_,
not whether to fix it.

### Variant A — Fix it as a build-config task before phase 4

Track down the glob that escapes the repo and constrain it. Candidates not yet
eliminated: a `next-auth`/`@auth` dependency resolving a home-directory path, a
webpack `snapshot.managedPaths` default, or a transitive `glob` call seeded with
an unanchored pattern. Because `next dev` is unaffected, the caller is
build-only — file tracing, the production webpack pass, or a plugin that only
runs on build.

**Pros.** Fixes the real problem; unblocks any deploy work; the diagnosis above
narrows the search a lot.
**Cons.** Open-ended — the error carries no stack frames, so it may need
`--trace-deprecation`-style instrumentation or bisecting dependencies.

### Variant B — Treat it as environmental, fix the environment

`Application Data` is a legacy NTFS junction that exists purely for pre-Vista
compatibility and denies access by design. A build that never walks into
`C:\Users\<user>` never sees it. Moving the repo is not the fix (it is already
outside the profile) — but running the build inside WSL2 or the project's own
Docker image sidesteps the junction entirely.

**Pros.** Zero application code changes; matches how the app is actually
deployed (Docker, per `docs/10-infrastructure.md`); likely also fixes other
Windows path grief.
**Cons.** Leaves a real bug latent for any contributor building natively on
Windows; slower inner loop if it becomes the only way to build.

### Variant C — Add `build` to the `yarn verify` gate

Orthogonal to the cause, but the reason this went unnoticed: `yarn verify` is
typecheck → lint → format:check → test, and **none of those compile the app**.
A production build has been broken with a fully green gate.

**Pros.** Closes the hole that let this hide; would have caught it immediately.
**Cons.** Makes the gate substantially slower; and adding it while the build is
broken means the gate is red until Variant A or B lands, so it has to follow,
not lead.

### Development paths

- **Roadmap:** belongs before phase 4 (Deploy) in `docs/04-roadmap.md` — the
  Deployer builds images, and it cannot ship what will not build. Not urgent for
  1.2b/1.2c, which are dev-server work.
- **Artifacts:** `apps/web/next.config.ts`, possibly `docs/10-infrastructure.md`
  (if the answer is "build in Docker"), and `package.json` if Variant C lands.
- **Role:** none — this is platform maintenance, not an AI-role concern.
- **Relation to open questions:** none of the nine in `docs/12-open-questions.md`
  covers it; it would be a new entry if it turns out to be architectural rather
  than a one-line glob fix.

## Critical analysis

**The impact claim deserves scrutiny.** "Nobody can produce a production build on
this machine" is verified for this machine only. Whether CI (once it exists) or a
Linux/Docker build is affected is _unknown_ — and on the evidence that the cause
is a Windows-only junction, probably not. So the severity is "blocks native
Windows builds", which is a developer-experience problem, not a
ship-blocker. Overstating it would justify urgency the finding does not earn.

**For Variant A to be worth the time**, someone has to actually build natively on
Windows. If the answer is that all real builds happen in Docker (which is what
`docs/10-infrastructure.md` prescribes), then Variant A is effort spent on a
path nobody uses, and Variant B is the honest answer — with a documented
"don't build natively on Windows" line rather than a fix.

**The strongest argument against deferring** is Variant C's observation: the gate
does not build. That gap is independent of this bug and will hide the next one
too. But note the ordering trap — adding `build` to `verify` before the build
works turns the gate permanently red, which trains everyone to ignore it. Worse
than not having it.

**When not to do this:** not now, mid-1.2c. The Tailwind upgrade was verified by
other means (the Tailwind CLI compiled the CSS directly, and the dev server
served the correct output), so this does not block the current branch. Picking it
up now would be scope creep on a task that is already done.

**One unverified assumption to re-test before fixing:** that the glob originates
in the build and not in Yarn's own resolution. The check was `next build` in
isolation; running the equivalent through a bare `node` invocation with the same
cwd would separate those.
