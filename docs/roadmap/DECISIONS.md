# Autopilot decisions log

Append-only decisions made during docs-autopilot without user input. For blocking
doc gaps resolved in Wave A, see also `DOC_RESOLUTIONS.md`.

---

## Wave A (doc analyst)

| ID | Decision | Reference |
| --- | --- | --- |
| R-A3-01 | UI spec follows shipped OpenUI `ProjectShell` / `AgentInterface` | `DOC_RESOLUTIONS.md` |
| R-A3-02 | `AGENTS.md` **Current phase** block added | `DOC_RESOLUTIONS.md` |
| R-A4-01 | Sandbox lint gate is fatal (Task 3.1) | `DOC_RESOLUTIONS.md` |
| R-A4-02 | ESLint FSD = `boundaries/dependencies`, not `import/no-internal-modules` | `DOC_RESOLUTIONS.md` |
| R-A3-05 | Deployer prompt deferred (T3) — not blocking `DOCS_COMPLETE` | `DOC_RESOLUTIONS.md` |

---

## Wave B (code gap audit) — 2026-08-31

### R-B-01 — Merge Wave A before gap audit

**Context:** Wave A docs (`docs/roadmap/`, glossary, reconciled specs) lived on
`cursor/docs-wave-a-pass1-c213`, not `main`.

**Decision:** Fast-forward Wave B branch to include Wave A commits so
`DOCS_COMPLETE=yes` and the reconciled doc set are the audit baseline.

---

### R-B-02 — Branch-per-task satisfies MVP-1 manual-edit protection

**Context:** `FileLock` model exists in `schema_project_template.prisma` but has
zero runtime usage in TypeScript.

**Decision:** Mark `MVP1-R02` **done** with evidence from branch-per-task
(`apps/worker/src/code/branch.ts`, merge-on-ACCEPTED). FileLock remains schema
placeholder until a future task needs file-granular locks.

**Evidence:** Grep: no `FileLock` references outside Prisma schema.

---

### R-B-03 — MVP-2 Task 4.1 status = partial, not done

**Context:** Roadmap notes Reviewer one-shot shipped; unit-test generation and
full check-results UI deferred.

**Decision:** Split 4.1 into sub-requirements in `REQUIREMENTS.md`:
`MVP2-41-RV` done, `MVP2-41-UI` open (partial), `MVP2-41-UT` open.

---

### R-B-04 — Deploy URL `docker://` is not domain deploy

**Context:** `deploy/handler.ts` records `docker://{imageTag}` as deployment URL.

**Decision:** `MVP2-43-DOMAIN` stays **open**; `MVP2-43-LOGS` marked **done**
(deploy log polling in UI exists).

---

### R-B-05 — Narrow vs full dogfood distinction

**Context:** Slim MVP-1 §6.5 and MVP-2 Task 5.1 overlap conceptually.

**Decision:** `MVP1-R05` (narrow checklist) and `MVP2-51` (full AI Studio
self-build) both **open** — checklist is documented but not executed in CI;
full dogfood requires MVP-2 product features per roadmap §3.3.

---

### R-B-06 — MVP-3 remote branches not merged

**Context:** `origin/cursor/mvp3-*` branches exist but are not on the Wave B baseline.

**Decision:** All MVP-3 tracks remain **open** until merged to the active branch
with verifiable evidence. Do not mark done from branch names alone.

---

### R-B-07 — Forever-waive scope

**Context:** User mandate: waive only when docs explicitly say so.

**Decision:** Four forever-waives from `docs/04-roadmap.md` §5.3 only (FW-01–FW-04).
No Stripe waiver found in docs — not listed. Deployer prompt (ENG-T03) stays
**open** but was waived as *blocking for docs* in Wave A (R-A3-05).

---

### R-B-08 — Next implementation priority order

**Decision:** Foundation first (A1, A2, B1, B2), then close slim MVP-1 dogfood
proof, then MVP-2 domain deploy and Agent wave (A3, A4, C1, D1). Aligns with
`docs/04-roadmap.md` §5.2 recommended waves and gap severity (duplicate commits
and missing observability block all mature features).
