---
description: Capture an idea for later, non-blocking — instant verbatim capture, expansion in the background
argument-hint: <идея>
allowed-tools: Read, Write, Glob, Grep, Agent
---

Capture this note: **$ARGUMENTS**

Existing notes (for the slug and the index): !`ls notes/ 2>/dev/null || echo "notes/ does not exist yet"`

This command is **non-blocking by design**. The user is usually mid-task; the point is that the idea is safe in one step and the thinking happens without them waiting for it. The tool cap in the frontmatter is deliberate — no Bash, so this command physically cannot start development.

**1. Capture immediately.** Write `notes/<YYYY-MM-DD>-<slug>.md` right now, with frontmatter (`date`, `status: idea`, `source_language`) and `## Verbatim note` containing `$ARGUMENTS` character-for-character in the user's language. Derive the slug as kebab-case English transliteration. Do this first and on your own — if everything after this step fails, the idea is still recorded.

**2. Delegate the expansion to the background.** Launch one background subagent (`run_in_background: true`) that reads `.claude/skills/notes/SKILL.md` and:

- appends `## Expanded idea` (2–3 variants with pros/cons plus how each would fit AI Studio — which role, which roadmap task, which artifact) and `## Critical analysis` (risks, objections, what would have to be true, when not to do it), both in **English** per the cost rule;
- creates or updates the `notes/README.md` index row (`Date | File | Idea | Status`);
- must not touch any file outside `notes/`, must not plan or implement, must not create a roadmap task.

**3. Acknowledge in one line and stop.** Report the path and that expansion is running in the background — e.g. `Заметка записана: notes/2026-08-03-foo.md, развитие в фоне.` Then return to whatever the user was doing. Do not wait for the subagent, do not summarize the note back, do not propose next steps, do not ask whether to build it.

If `$ARGUMENTS` is empty, ask for the note text instead of inventing one.
