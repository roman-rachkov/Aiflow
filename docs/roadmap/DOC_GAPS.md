# Documentation gaps — Wave A

Append-only findings from doc analyst passes. Severity: 🔴 blocking · ⚠️ important · ℹ️ minor.

Status: `open` | `fixed` | `waived`

---

## Wave A pass 1 — Analyst A3–A4 (2026-08-31)

| ID    | Severity | Area                       | Finding                                                                                                                                                                | Status |
| ----- | -------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| A3-01 | 🔴       | `docs/09-ui-spec.md`       | UI spec described legacy three-column `/research` layout; shipped UX is OpenUI `ProjectShell` (`AgentInterface`) at `/projects/[id]` with sidebar Routes.              | fixed  |
| A3-02 | 🔴       | `AGENTS.md`                | Missing **Current phase** block required by docs-autopilot continuity.                                                                                                 | fixed  |
| A3-03 | ⚠️       | `.claude/agents/coder.md`  | YAML `description` says «and commits»; Coder never commits (runner does). Prompt body correct; frontmatter misleads.                                                   | open   |
| A3-04 | ℹ️       | `docs/05`–`08` vs agents   | Mirror bodies match docs (link paths + footer note only). T2 automation still open.                                                                                    | open   |
| A3-05 | ℹ️       | `docs/13-agent-tooling.md` | Deployer prompt absent — tracked T3, deferred post-MVP local. Not blocking implementation docs.                                                                        | waived |
| A4-01 | 🔴       | `docs/15` § 3.2            | Claimed sandbox lint gate «fake»; `runner.js` (Task 3.1) makes ESLint/Prettier/prisma fatal.                                                                           | fixed  |
| A4-02 | 🔴       | `docs/15` § 4.2            | Documented `next/core-web-vitals` + `import/no-internal-modules` / `no-restricted-imports`; actual config uses `typescript-eslint` strict + `boundaries/dependencies`. | fixed  |
| A4-03 | ⚠️       | `docs/15` § 2.2 + barrels  | Cross-slice enforced by boundaries; barrel-only `index.ts` imports are convention only — no active `import/no-internal-modules`.                                       | open   |
| A4-04 | ⚠️       | `docs/09-ui-spec.md`       | Shared Modal/Toast/Timeline still unbuilt; timeline UI for tasks not as spec diagram.                                                                                  | open   |
| A4-05 | ℹ️       | `docs/09-ui-spec.md`       | `/projects/[id]/agents` screen not shipped (MVP-2 Support Bot).                                                                                                        | open   |
| A4-06 | ℹ️       | `docs/16-code-map.md`      | Stale AppNav-only shell description; skill vendoring count imprecise.                                                                                                  | fixed  |
| A4-07 | ℹ️       | `notes/`                   | Two notes files; no blocking gaps. EPERM note is env hygiene, not spec drift.                                                                                          | waived |

### Pass 1 counts

| Severity | Found | Fixed | Open | Waived |
| -------- | ----- | ----- | ---- | ------ |
| 🔴       | 4     | 4     | 0    | 0      |
| ⚠️       | 3     | 0     | 3    | 0      |
| ℹ️       | 4     | 1     | 2    | 2      |
