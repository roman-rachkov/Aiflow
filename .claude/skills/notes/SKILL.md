---
name: notes
description: Capture an idea for later without acting on it. Use whenever the user writes a note — usually a short Russian prompt like "запиши", "заметка", "сохрани идею", "на будущее" — and wants it stored verbatim, expanded, and critically examined. Produces exactly three blocks. Never plans, never implements, never touches anything outside notes/.
---

# Notes skill

Capture an idea for the future. This is deliberately **not development**: the note is stored, expanded and critiqued, and nothing else happens.

**Invariant — this skill must never:**

- start planning or implementation (no roadmap task, no SPEC, no branch),
- modify any file of the current task or anywhere outside `notes/`,
- call build / test / verify / Bash.

If a note evolves into something worth building, that is a separate, later decision made by the user — the note only records the idea, the expansion and the critique.

## Trigger

Use whenever the user writes a standalone idea rather than a request to do work. Common Russian triggers: «заметка», «запиши», «запиши идею», «сохрани идею», «на будущее», «не забудь», «идея на потом». Also invoked explicitly via the `/note` slash command. If the user writes one of these mid-task, capture the note (this skill) and **continue the current task** — do not switch context or stop to expand on the spot.

## Output — exactly three blocks

Fixed English H2 headings (per the SPEC.md convention); prose language per the repo language rule — Blocks 2–3 in English (cost rule), Block 1 in the user's language. No fourth block, no "Next steps", no task creation.

### 1. `## Verbatim note`

The user's raw text, **character-for-character**, in the user's language, as one quoted block. If the exact text is uncertain, quote what was typed and flag the uncertainty rather than paraphrasing. This is the only user-language content in the file.

### 2. `## Expanded idea`

2–3 variants (`### Variant A` / `### Variant B` / `### Variant C`), each with pros and cons, plus a "development paths" sub-block: how it would fit AI Studio — which role, which roadmap task, which artifact (SPEC.md, queue, sandbox, prompt). Internal analysis in **English** (cost rule).

### 3. `## Critical analysis`

Devil's advocate: risks, cons, objections; what would have to be true for it to be worth building; when _not_ to do it.

## Storage

- One file per note: `notes/<YYYY-MM-DD>-<slug>.md` (slug = kebab-case English transliteration).
- Frontmatter: `date` (ISO), `status` (`idea` / `considered` / `rejected` / `promoted`), `source_language`.
- Index: `notes/README.md` — table `Date | File | Idea (one line) | Status`. Create it with the first note. Status flips are recorded in the index; `promoted` links to the roadmap task in `docs/04-roadmap.md`.
- Notes are committed by default (they feed future planning; markdown is diff-friendly). A personal note that should stay private is stored outside the repo instead — flag that when it happens.

## Rules

1. Never start development, never create a task, never open a roadmap row.
2. Never reorder or merge the three blocks; the order is verbatim → expanded → critical.
3. Block 1 is verbatim and is the only user-language content; Blocks 2–3 stay in English.
4. Write the file and update the index. Nothing else.
