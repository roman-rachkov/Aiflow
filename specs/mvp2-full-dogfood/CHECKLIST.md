# MVP-2 Task 5.1 — Full platform dogfood checklist

## Goal

Run the **AI Studio** product idea through the full cycle inside the platform:
Researcher → approved `SPEC.md` → Planner → Coder → Deploy. Records problems and
evidence in `EVIDENCE.md`.

This is broader than slim MVP-1 narrow dogfood (`specs/slim-mvp1-dogfood/`), which
exercises a minimal todo-crud SPEC only.

## Recommended SPEC

Use `specs/ai-studio/SPEC.md` (platform self-build) or upload your own approved SPEC
from the design phase.

## Automated shortcut (todo-crud cycle)

For CI/operator proof of plan→codegen inside compose without the full self-build:

```bash
yarn dogfood-live
# or: bash tools/dogfood-live/run.sh
```

This uses `tools/evals/cases/todo-crud/spec.md` and appends to `EVIDENCE.md`.
Mark **MVP2-51 partial** when this passes; mark **done** after a recorded
ai-studio self-build run.

## Manual full cycle (ai-studio self-build)

1. `docker compose up` (+ sandbox image build — see slim dogfood checklist).
2. Sign in as dev user (`seed:dev-user`).
3. Create project **AI Studio Dogfood**; upload or paste `specs/ai-studio/SPEC.md`.
4. Approve SPEC in Researcher / Specifications UI.
5. **Сгенерировать план** → wait for tasks.
6. **Запустить план** → watch WS logs; expect sandbox green + commits.
7. Optional: LLM Reviewer loop (MVP-2), Support Bot panel, Traefik deploy URL.
8. Record run in `EVIDENCE.md` with screenshots or TaskLog ids.

## Out of scope for first pass

- Multi-project load test (see `yarn load-test` — MVP2-52 done).
- Production cutover (see `docs/prod-deployment.md`).
