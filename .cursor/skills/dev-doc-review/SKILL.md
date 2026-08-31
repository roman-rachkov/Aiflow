---
name: dev-doc-review
description: >-
  Reviews development vision/GDD/spec docs for gaps, contradictions, scope
  creep, missing non-goals, weak sim loops, and implementation blind spots.
  Produces a structured review with severity and concrete fix prompts so the
  doc can be iterated. Use when the user says /dev-doc-review, asks to
  проревьювить спецификацию/ГДД/видение, or wants to harden docs before coding.
---

# Dev Doc Review

Reviewer for specs produced by `dev-spec-analyst` or hand-written vision docs (e.g. `docs/sand.md`, `docs/specs/*`).

## Trigger

- `/dev-doc-review`
- «проревьювь док», «найди дыры в спецификации», «harden the GDD»

Input: path to doc, pasted draft, or «последняя спека».

## Process

1. Read the target doc end-to-end.
2. Skim related code/docs only to check **feasibility vs current repo** (do not expand into a second vision).
3. Produce a review in chat (and optionally save — see below).
4. End with: top 3 must-fix before coding + suggested next analyst questions.

## Review checklist

Score each area: ✅ ok / ⚠️ weak / 🔴 blocking

| Area            | Look for                                                       |
| --------------- | -------------------------------------------------------------- |
| Problem clarity | Is «почему не делать потому что» explicit?                     |
| MVP cut         | Non-goals listed? Phase 1 shippable alone?                     |
| Loop integrity  | Need → method → action → feedback visible?                     |
| Data model      | Fields enough to implement? Ambiguous enums?                   |
| Repo fit        | Contradicts existing modules/ADRs? Missing hooks?              |
| Cost/ops        | LLM calls per tick? Debug story?                               |
| Edge cases      | Failure of chains, death, empty inventory, concurrent needs    |
| Monetization    | Observer/curator value if relevant; no credit/wallet confusion |
| Testability     | Smoke / acceptance criteria present?                           |
| Consistency     | Internal contradictions, undefined terms                       |

## Output format (chat)

```markdown
## Review: <doc title>

**Вердикт:** ship-as-is / iterate / rewrite section X

### Findings

1. 🔴 [area] — problem — suggested fix
2. ⚠️ ...
3. ✅ strengths (brief)

### Open questions for author

- ...

### Next

- [ ] must-fix before code
- Suggested: /dev-spec-analyst round on <topic>
```

## Optional save

If the user wants a file: `docs/specs/ревью-<slug>.md` (or same dir as the reviewed doc).  
Chat log: `ревью-<slug> сохранён → <path>`. Default: chat only.

## Anti-patterns

- Rewriting the whole doc unprompted
- Style nits without substance
- Demanding AAA scope on an MVP doc
- Approving vague «agents will be smart» without a loop
