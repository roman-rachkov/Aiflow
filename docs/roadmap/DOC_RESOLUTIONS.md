# Analyst Resolutions — Wave A Pass 1

Binding decisions for open questions that blocked documentation or prod
narrative. Implementation code is unchanged in this pass (docs only).

---

## RES-004 — `docker.sock` on the worker (OQ #4)

**Decision:** Keep the host socket mount **dev-only** (current
`docker-compose.yml`). For production sandbox orchestration, adopt a
**dedicated Docker host** reached via **dockerode + mutual TLS** — not the
platform app host, not an in-cluster `docker.sock` mount.

| Environment | Mechanism | Rationale |
| --- | --- | --- |
| Dev / Compose | Bind-mount `/var/run/docker.sock` on `worker` | Zero extra infra; acceptable on a single-engineer machine |
| Prod (MVP-3 **D3** packaging) | Remote Docker API on a sandbox-only VM; TLS client certs in worker secrets | Blast radius isolated from Postgres/Redis; matches OQ #4 option "dedicated Docker host" |
| Rejected for MVP scale | Kubernetes Jobs per coder task | Operational cost exceeds 5 concurrent projects |
| Rejected | Remote runner without TLS | Same privilege as sock mount over the network |

**Does not block MVP-0/1/2 dev work.** Prod compose must drop the sock mount
when D3 lands; until then document the mount as `DEV-ONLY` (already in compose
comments).

**Affected docs updated:** `12-open-questions.md` status table, `10-infrastructure.md`
§ Moving to production, `11-sandbox.md` integration note.

---

## RES-009 — Escalation to a stronger model (OQ #9)

**Decision:** Escalation is **explicitly post-MVP**. Ship at **MVP-3 task C3**
only. Until then:

1. Each role runs on a **single model** from `ModelConfig.config`.
2. `services/model-router` may remain a stub but **must not foreclose** a second
   routed request (advisor) — same OpenAI-compatible contract as the primary.
3. **Trigger policy (when C3 ships):** worker-decided fixed points — before
   `plan-generate`, on repeated task failure, before marking a plan complete —
   not model-decided ad hoc.
4. **Advisor constraint:** advisor model ≥ primary capability (Anthropic pattern).
5. **Cache:** escalated calls are **not** written to the 1-hour Redis response
   cache (distinct cache key namespace `escalation:` or skip cache entirely).
6. **Structured output:** pairs with C3 in `14-decisions-needed.md` — validate +
   retry on parse failure; advisor disagreement is a separate retry policy (max 1
   advisor override per trigger).

**Does not block current implementation.** No `advisor` field in `ModelConfig`
until C3 schema migration.

**Affected docs updated:** `12-open-questions.md` #9 status, `02-architecture.md`
§2.5 note, `04-roadmap.md` §5 C3 cross-ref.

---

## RES-QUEUE — Canonical BullMQ queue names

**Decision:** All documentation uses **hyphen** queue names matching
`packages/queue` and compose `QUEUES`:

`spec-generate`, `plan-generate`, `code-execute`, `code-review`,
`deploy-run`, `chat-run`.

Colon forms (`plan:generate`, etc.) are **historical aliases only** — invalid
for BullMQ (Redis key separator). Prompt files updated in a later wave.

---

## RES-SLIM-MVP1-GATE — Product acceptance gate

**Decision (reaffirms OQ #7):** Slim MVP-1 product gate = sandbox runner checks
(tsc, ESLint `--max-warnings 0`, Prettier, `prisma validate`). LLM Reviewer
(`code-review`) may run in dev/staging but is **not** the slim MVP-1 ship
criterion; full Reviewer product gate = MVP-2 §4.1; Self-Refine loop = MVP-3 C1.
