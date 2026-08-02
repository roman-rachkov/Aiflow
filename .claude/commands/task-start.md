---
description: Start a roadmap task on a correctly-named branch off current main
argument-hint: <roadmap-id> <slug>
allowed-tools: Bash(git status:*), Bash(git log:*), Bash(git fetch:*), Bash(git switch:*), Bash(git branch:*), Read, Glob, Grep
---

Start work on roadmap task **$1** with slug **$2**.

Current state:

- Branch and working tree: !`git status --short --branch`
- Recent history: !`git log --oneline -5`

Do the following, in order, and stop at the first thing that looks wrong rather than pushing through.

**1. Check the working tree is clean.** If there are uncommitted changes, stop and report them. Do not stash, do not commit them to get out of the way — the user decides what happens to their work.

**2. Check the branch name is valid.** Per `docs/15-engineering-conventions.md` § 1.1, the pattern is `task/{roadmap-id}-{slug}`, where the slug is kebab-case, ASCII, derived from the task title, truncated to 40 characters. The branch to create is `task/$1-$2`. If `$2` does not satisfy that, say what a valid slug would be and ask before proceeding.

**3. Create the branch off current `main`.** Fetch first, then branch from `origin/main` — not from whatever HEAD happens to be. If the current branch is already a `task/` branch, that is worth flagging: it may mean the previous task was never merged.

**4. Find the task in the roadmap.** Read `docs/04-roadmap.md` and locate task `$1`. Report:

- What the task covers
- Its acceptance criteria, as a checklist
- Which files or packages it is expected to touch
- Anything it depends on that is not done yet

If the task ID does not exist in the roadmap, say so plainly rather than inventing a plausible task.

**5. Flag relevant open questions.** Check `docs/12-open-questions.md` and `docs/14-decisions-needed.md` for anything Open that this task would force a decision on. `CLAUDE.md` names the ones with the widest blast radius. Better to surface a blocker now than to discover it half-implemented.

Do not start implementing. This command sets up and orients; the work is a separate decision.
