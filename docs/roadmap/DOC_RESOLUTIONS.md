# Doc analyst resolutions (mini-ADR)

Decisions made during docs-autopilot Wave A without user input. Source of truth for
defaults that closed blocking gaps.

---

## R-A3-01 — UI spec follows shipped OpenUI shell (2026-08-31)

**Context:** `docs/09-ui-spec.md` predated Stage D (`ProjectShell`, `AgentInterface`).

**Decision:** Canonical project UX is `/projects/[id]` full-bleed shell: chat default,
sidebar threads + Route panels (`files`, `tasks`, `deploy`, `spec`, `models`). Legacy
`/research` redirects home. Standalone `/tasks` and `/deployments` remain deep links.
`AppNav` applies only to `(app)` layout (project list).

**Rationale:** Code map and `ProjectShell.tsx` are authoritative; spec must match for
Wave B requirement extraction.

---

## R-A3-02 — AGENTS.md continuity block (2026-08-31)

**Context:** docs-autopilot SKILL requires `Current phase` with gate flags and run commands.

**Decision:** Add table linking `DOCS_COMPLETE`, `APP_COMPLETE`, next wave, and
`docker compose exec app yarn verify`.

---

## R-A4-01 — Sandbox lint gate is real (2026-08-31)

**Context:** `docs/15` § 3.2 still described pre-3.1 non-fatal lint.

**Decision:** Document `runner.js` + `runner-gate.js` fatal chain (tsc, eslint,
prettier, prisma validate) before commit.

**Evidence:** `docker/aider-sandbox/runner.js`, `runner-checks.js`.

---

## R-A4-02 — ESLint FSD enforcement = boundaries plugin (2026-08-31)

**Context:** Docs cited `import/no-internal-modules` and `no-restricted-imports` not present
in `eslint.config.mjs` (only `import/no-cycle` + `boundaries/dependencies`).

**Decision:** Update `docs/15` § 4.2 and `AGENTS.md` to describe actual stack. Cross-slice
is enforced; barrel-only deep imports remain convention + future T2 work.

**Not decided:** Re-add `import/no-internal-modules` — deferred; log as A4-03 open gap.

---

## R-A3-05 — Deployer prompt deferral stands (2026-08-31)

**Context:** T3 — no `docs/08`-style deployer prompt.

**Decision:** Waive as blocking for `DOCS_COMPLETE`; deploy path is largely deterministic
code (`deploy-run` worker). Revisit when MVP-3 domain deploy (D3) needs LLM steps.
