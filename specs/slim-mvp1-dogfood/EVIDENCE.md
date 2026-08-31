# MVP-1 Dogfood Evidence Log

Records of operator-run slim MVP-1 dogfood sessions per [CHECKLIST.md](CHECKLIST.md).
One entry per run. Satisfies readiness criteria R01 and R05 when at least one entry
shows `result: PASS` for both.

---

## Template — copy for each run

```
## Run <N>

| Field    | Value |
| -------- | ----- |
| Date     | YYYY-MM-DD |
| Operator | name / handle |
| Branch   | main@<short-sha> |
| Model    | provider / model slug used for Planner + Coder |
| Sandbox  | aistudio/aider-sandbox:<tag> |

### Checklist result

| Step | Outcome | Notes |
| ---- | ------- | ----- |
| 1. `docker compose up` | PASS / FAIL | |
| 2. Sandbox image build | PASS / FAIL / skip (pre-built) | |
| 3. Sign in, create project, Researcher → approve SPEC | PASS / FAIL | |
| 4. Plan generation (`plan:generate`) | PASS / FAIL | |
| 5. Code execution (`code:execute`) | PASS / FAIL | |
| 6. WS logs + task branch commit | PASS / FAIL | branch name |
| 7. (optional) Deploy image build | PASS / FAIL / skip | |

### Overall result

`R01: PASS / FAIL` — customer path Planner → Coder produced a CRUD commit.
`R05: PASS / FAIL` — narrow dogfood: one CRUD through plan → codegen.

### Artefacts

- TaskLog entry id (Postgres): ``
- Screenshot or log snippet:
  <!-- attach or paste -->

### Issues found

<!-- list any blockers or regressions; link to fix commits -->
```

---

<!-- Paste completed entries below this line -->

## Run automated-2026-08-31

| Field    | Value                        |
| -------- | ---------------------------- |
| Date     | 2026-08-31                   |
| Operator | yarn dogfood-smoke (CI gate) |
| Branch   | main@b5e6a2d                 |
| Model    | mocked — handler wiring only |
| Sandbox  | not required (unit gate)     |

### Checklist result

| Step                      | Outcome | Notes                                |
| ------------------------- | ------- | ------------------------------------ |
| 1. `docker compose up`    | skip    | automated gate — no live stack       |
| 2. Sandbox image build    | skip    |                                      |
| 3. Researcher → SPEC      | skip    |                                      |
| 4. Plan generation wiring | PASS    | validatePlanPayload + parsePlanTasks |
| 5. Code execution wiring  | PASS    | review retry cap + deploy claim      |
| 6. WS logs + commit       | skip    | live sandbox required                |
| 7. Deploy URL builder     | PASS    | buildDeployUrl smoke                 |

### Overall result

`R01: PARTIAL` — Planner→Coder path validated at handler/parse layer; live LLM+sandbox still operator-run.
`R05: PARTIAL` — automated gate proves slim path wiring; full codegen needs compose.

### Artefacts

- Test file: `tools/dogfood-smoke/src/pipeline-smoke.test.ts`
- Tests passed: 5
