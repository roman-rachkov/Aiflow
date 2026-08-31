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
