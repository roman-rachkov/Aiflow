# Master roadmap — phases and wave priorities

Derived from `docs/04-roadmap.md` and reconciled with the codebase (Wave B, 2026-08-31).

## Phase overview

| Phase          | Goal                                                 | Status              | Evidence                                                                                            |
| -------------- | ---------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------- |
| **MVP-0**      | Researcher + manual coding + manual deploy           | **Complete**        | All tasks 1.1–2.3 shipped; see `REQUIREMENTS.md` MVP0-*                                             |
| **Slim MVP-1** | Planner + sandbox Coder; sandbox checks as gate      | **Mostly complete** | Tasks 3.1–3.3 done; readiness R01/R05 (live dogfood proof) open                                     |
| **MVP-2**      | Product features deferred from slim MVP-1            | **Partial**         | Reviewer one-shot (4.1) + deploy logs shipped; Support Bot, domain deploy, dogfood, load, docs open |
| **MVP-3**      | Agent maturity (durable, observable, policy-bounded) | **Not started**     | Planned section in `docs/16-code-map.md`; no A/B/C/D code                                           |

---

## MVP-0 (complete)

| Task                     | Depends on | Status | Next wave |
| ------------------------ | ---------- | ------ | --------- |
| 1.1 Project init         | —          | done   | —         |
| 1.2a Auth + shell        | 1.1        | done   | —         |
| 1.2b Projects CRUD       | 1.2a       | done   | —         |
| 1.2c Tailwind v4         | 1.2a       | done   | —         |
| 1.2d Design system       | 1.2a       | done   | —         |
| 1.3 Researcher chat      | 1.2b       | done   | —         |
| 2.1 RAG + SPEC           | 1.3        | done   | —         |
| 2.2 Editor + Gitea       | 1.2b       | done   | —         |
| 2.3 Deploy + ModelConfig | 2.2        | done   | —         |

---

## Slim MVP-1 (mostly complete)

| Task                             | Depends on | Status   | Next wave                                       |
| -------------------------------- | ---------- | -------- | ----------------------------------------------- |
| 3.1 Sandbox infra                | 2.2        | done     | —                                               |
| 3.2 Planner                      | 2.1, 3.1   | done     | —                                               |
| 3.3 Coder                        | 3.1, 3.2   | done     | —                                               |
| R01 Customer CRUD E2E proof      | 3.3        | **open** | Wave C — operator or automated dogfood          |
| R05 Narrow dogfood checklist run | 3.3        | **open** | Wave C — `specs/slim-mvp1-dogfood/CHECKLIST.md` |

---

## MVP-2 (partial)

| Task                              | Depends on     | Status      | Next wave priority                              |
| --------------------------------- | -------------- | ----------- | ----------------------------------------------- |
| **4.1** Acceptance loop           | 3.3            | **partial** | P2 — finish UI (→ D1); unit-test agent deferred |
| 4.1a Static sandbox checks        | 3.1            | done        | —                                               |
| 4.1b LLM Reviewer one-shot        | 3.3            | done        | —                                               |
| 4.1c Review results UI (MVP)      | 4.1b           | partial     | P3 — full D1 after C1                           |
| 4.1d Unit test generation         | 4.1b           | open        | P5 — post-Self-Refine                           |
| **4.2** Support Bot               | 2.1            | **open**    | P4 — after foundation optional                  |
| **4.3** Domain deploy             | 2.3            | **open**    | P2 — Traefik/nginx + real URL                   |
| **5.1** Full dogfooding           | 4.1–4.3        | **open**    | P5 — after D4 prerequisites                     |
| **5.2** Load testing              | 3.1            | **open**    | P5 — script + Bull Board                        |
| **5.3** Stabilization + user docs | MVP-2 features | **open**    | P4 — root README when features land             |

---

## MVP-3 — execution order (§5.2)

Dependency graph from `docs/04-roadmap.md` §5.2:

```
A1 → A2 → A3 → A4          (maturity — foundation)
B1 → B2 → B3, B4           (observability — parallel with A)
C1 (needs A4)              (Reviewer Self-Refine)
C2 (needs C1)              (AgentMemory)
D1 (needs C1)              (Reviewer UI)
C3 (needs B2)              (escalation)
C4 (needs B3)              (Planner ToT)
D2, D3 (need A1, A3)       (Support Bot, domain deploy — mature)
D4 (needs B2, B3)          (dogfood with metrics)
```

### Recommended implementation waves

| Wave             | Focus                                    | Tasks          | Status | Priority |
| ---------------- | ---------------------------------------- | -------------- | ------ | -------- |
| **Foundation**   | Idempotency + observability skeleton     | A1, A2, B1, B2 | open   | **P1**   |
| **Agent**        | Audit, policy, Self-Refine, verdict UI   | A3, A4, C1, D1 | open   | **P2**   |
| **Intelligence** | Memory, escalation, evals, red-team      | C2, C3, B3, B4 | open   | **P3**   |
| **Product**      | Support Bot, domain deploy, ToT, dogfood | D2, D3, C4, D4 | open   | **P4**   |

### MVP-3 task table

| ID  | Task                           | Depends on      | Status | Next wave           |
| --- | ------------------------------ | --------------- | ------ | ------------------- |
| A1  | Idempotent workers             | —               | open   | Foundation — **P1** |
| A2  | Resumable pipeline             | A1              | open   | Foundation — **P1** |
| A3  | Audit trails                   | A2              | open   | Agent — P2          |
| A4  | Role policy layer              | A3              | open   | Agent — P2          |
| B1  | Langfuse in compose            | —               | open   | Foundation — **P1** |
| B2  | LLM call tracing               | B1              | open   | Foundation — **P1** |
| B3  | Evals framework                | B2              | open   | Intelligence — P3   |
| B4  | Prompt-injection red-team      | B2              | open   | Intelligence — P3   |
| C1  | Reviewer Self-Refine loop      | A4              | open   | Agent — **P2**      |
| C2  | AgentMemory                    | C1              | open   | Intelligence — P3   |
| C3  | Model escalation               | B2              | open   | Intelligence — P3   |
| C4  | Planner ToT (flagged)          | B3              | open   | Product — P4        |
| D1  | Full Reviewer UI               | C1              | open   | Agent — P2          |
| D2  | Support Bot (mature)           | A1, A3, MVP2-42 | open   | Product — P4        |
| D3  | Domain deploy (mature)         | A1, A3, MVP2-43 | open   | Product — P2/P4     |
| D4  | Dogfood + load + stabilization | B2, B3, MVP2-5x | open   | Product — P5        |

---

## Explicitly out of scope (forever-waive)

See `REQUIREMENTS.md` FW-01–FW-04 and `docs/04-roadmap.md` §5.3.

---

## Next implementation milestones (Wave C+)

1. **Foundation wave** — A1 + A2 + B1 + B2 (idempotent workers, resumable pipeline, Langfuse, tracing).
2. **Slim MVP-1 closure** — execute narrow dogfood checklist with evidence (`MVP1-R01`, `MVP1-R05`).
3. **MVP-2 domain deploy** — Traefik/nginx service, real URL replacing `docker://` (`MVP2-43-DOMAIN`).
4. **Agent wave** — A3, A4, C1, D1 (audit, policy, Self-Refine, verdict UI).
5. **User-facing docs** — root README when MVP-2 feature set stabilizes (`MVP2-53-README`).
