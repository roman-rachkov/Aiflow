---
name: solo-notebook
description: >-
  Solo brainstorm notebook for one-person decision journaling. Expands a raw
  thought into: original note, pros/positive expansion, cons/risks, and
  side recommendations — always in context of the current repository and
  monetization/earnings. Auto-saves under a smart notes path and only logs a
  short confirmation in chat. Use when the user pastes {{note ... }}, asks for
  a notebook/брейншторм/заметку, or interrupts a prompt with an inline note block.
---

# Solo Notebook

Personal decision journal for solo work. Not meeting minutes.

## Inline trigger (mid-prompt)

When a message contains a note block, treat it as a notebook entry **and** still fulfill the rest of the prompt. Do not ask the user to switch chats or editors.

Primary delimiter:

```text
{{note
raw thought here
}}
```

Also accept bare multiline `{{ ... }}` when the block is clearly a personal note (not code/template).

## Background save (default)

Notes are a **half-background** process:

1. Resolve the notes directory (see below).
2. Expand the note with the template (grounded in repo + earnings).
3. Save `заметка_<N>.md` there.
4. In chat, print **only a short log**, e.g. `заметка_12-redis-vs-memory сохранена → docs/notes/заметка_12-redis-vs-memory.md`.
5. Do **not** dump the full notebook body in chat unless the user asks to open/read it.
6. Do **not** commit note files unless the user asks.

### Notes directory (auto-detect)

Pick the **first match** in the workspace root (create the final folder if missing):

1. `notes/` — if it already exists
2. `notebook/` — if it already exists
3. `заметки/` — if it already exists
4. `docs/notes/` — if `docs/` exists (preferred when the repo already has documentation)
5. `doc/notes/` — if `doc/` exists
6. `documentation/notes/` — if `documentation/` exists
7. else create `notes/`

Always write **into** that folder (or `…/notes` under docs), never scatter files among architecture/runbook docs.

Optional override: if `.solo-notebook` exists at repo root and contains a single relative path line (e.g. `docs/braindump`), use that path instead.

### Filename (context slug)

1. Derive a short **title** from the note topic (not a generic “заметка”) — ≤60 chars, language of the user.
2. Build a **slug** from the title:
   - lowercase
   - spaces/punctuation → `-`
   - keep Latin + Cyrillic letters and digits
   - collapse repeated `-`, trim ends
   - max ~50 chars
3. Glob `заметка_*.md` in the notes dir → next `N` = max id + 1 (start at `1`).
4. Filename: `заметка_<N>-<slug>.md`  
   Example: `заметка_1-система-потребностей.md`
5. If that path exists, append `-2`, `-3`, …
6. Chat log uses the **full basename** (with slug), so the list stays scannable.

### File format

```markdown
---
id: <N>
created: <ISO-8601>
title: <short contextual title, ≤60 chars>
slug: <slug>
repo: <workspace folder name>
---

# Заметка <N>: <title>

### Оригинал

[verbatim user note — do not rewrite]

### За / расширение

- ...

### Против / риски

- ...

### Рекомендации

- ...
```

### Mixed message behavior

Example:

```text
fix the checkout bug

{{note
redis vs in-memory sessions for MVP?
}}

then open a PR
```

Response order:

1. Do the main task.
2. Save the notebook file in the same turn.
3. In chat: task result + one-line log. No full note body.

If the message is **only** a note block → save file + one-line log only.

## Notebook sections

Always write these four sections (headings in Russian) into the **file**:

- **Оригинал** — verbatim user note
- **За / расширение** — разворачивание, позитив, доп. параметры, пункты «за»
- **Против / риски** — негатив, риски, стоимость, сложность
- **Рекомендации** — взгляд со стороны, решения, вердикт если уместен

## Context rules

Ground every expansion in:

1. **Current repository** — stack, existing code, constraints, stage of the product
2. **Заработок** — time-to-ship, cost, ROI, opportunity cost for a solo builder

Prefer concrete, actionable bullets. No team/meeting fields unless asked.

## Language

Match the user's language (Russian if they wrote in Russian). Keep code identifiers in their original form.
