# AI Studio — Codegen Sandbox (Aider Sandbox)

Image and runner live under [`docker/aider-sandbox/`](../docker/aider-sandbox/).
The sandbox is **template-free**: project source is cloned from Gitea (bootstrapped
from [`templates/user-nextjs/`](../templates/user-nextjs/)) and bind-mounted at
`/workspace`.

## Dockerfile

```dockerfile
# docker/aider-sandbox/Dockerfile
FROM node:22-bookworm-slim
# … python3, git, pinned aider-chat via ARG AIDER_VERSION=0.60.0 …
# COPY runner-checks.js runner-gate.js runner.js /usr/local/bin/
USER sandbox
ENTRYPOINT ["node", "/usr/local/bin/runner.js"]
```

Build (repo root as context):

```bash
docker build -t aistudio/aider-sandbox:latest -f docker/aider-sandbox/Dockerfile docker/aider-sandbox
```

## Runner behaviour

`runner.js` (+ `runner-checks.js`, `runner-gate.js`):

1. Reads `TASK_JSON`, `MODEL_PROVIDER`, `MODEL_NAME`, optional `API_BASE_URL`.
2. Reads the provider API key from **`/run/secrets/api_key`** (fail if missing/empty).
   Does **not** use `process.env.API_KEY` (avoids `/proc/1/environ` leakage).
3. Writes Aider config with `no-auto-commits: true`.
4. Runs Aider headless on the task branch.
5. Verification gate (all **fatal**): `tsc --noEmit`, ESLint `--max-warnings 0`,
   Prettier `--check`, `prisma validate`.
6. **On success only:** `git add -A && git commit` with the task title as the
   message. A commit therefore means “verified”. Gate failure → status
   `failure`, exit `1`, **no commit**.
7. Prints a final `=== RESULT ===` JSON line to stdout.

Prisma migrations are **validated** in the sandbox only; they are **applied at
deploy** (db push / migrate) — the sandbox has no platform Postgres access.

## Integration (dockerode) — worker helpers

`apps/worker/src/sandbox/buildSandboxContainerOptions` builds hardened
`createContainer` options (unit-tested without Docker):

```typescript
import { buildSandboxContainerOptions } from './sandbox';

const opts = buildSandboxContainerOptions({
  workspaceHostPath: '/path/to/clone',
  apiKeyHostPath: '/path/to/api_key_file',
  task: { title, description, acceptance },
  modelProvider,
  modelName,
  apiBaseUrl,
});
// docker.createContainer(opts)
```

Hardening (see also `ai-studio-internals` skill):

| Flag             | Value                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------- |
| `ReadonlyRootfs` | `true`                                                                                 |
| `CapDrop`        | `['ALL']`                                                                              |
| `SecurityOpt`    | `['no-new-privileges']`                                                                |
| Memory / CPU     | 512 MB / 1 CPU                                                                         |
| Tmpfs            | `/tmp`, `/home/sandbox` (`noexec`/`nosuid` where applicable)                           |
| `NetworkMode`    | `SANDBOX_NETWORK` env (default `aiflow_sandbox` — Compose project prefix + `_sandbox`) |
| Image            | `AIDER_SANDBOX_IMAGE` (default `aistudio/aider-sandbox:latest`)                        |
| Binds            | workspace → `/workspace`; api key file → `/run/secrets/api_key:ro`                     |

`docker.sock` on the worker remains **DEV-ONLY** (open question #4).

### `code:execute` worker (Task 3.3)

`apps/worker/src/code/` loads the Task (`deletedAt: null`), clones from Gitea,
checks out `task/{shortId}-{slug}`, and either:

- **dry-run** — writes a planned-prompt TaskLog stub, sets `AWAITING_REVIEW`,
  does **not** start a container; or
- **live** — writes `OPENAI_API_KEY` to a temp file, binds it at
  `/run/secrets/api_key`, runs the sandbox, streams logs to TaskLog + Redis
  `sandbox:logs:{taskId}`, parses `=== RESULT ===` JSON, pushes the branch on
  success (`DONE`) or marks `FAILED`.

Compose `QUEUES` includes `code:execute` alongside `plan:generate` and
`deploy:run`.

## registry-proxy

Sandbox egress is only `registry-proxy` on the internal `sandbox` network.
`ALLOWED_HOSTS` is a comma-separated allowlist (expandable). Defaults include npm,
yarn, PyPI, GitHub, and CDN hosts (`nodejs.org`, `objects.githubusercontent.com`,
`cdn.jsdelivr.net`). Denied hosts are logged. `GET /health` → 200. Listens on
`PORT` (default `3128`).

## Security

- Readonly rootfs; writable paths are tmpfs or explicit binds.
- Network: Compose `sandbox` network is `internal: true` — only registry-proxy.
- API key via read-only secret **file**, not environment.
- Unprivileged `sandbox` user; Aider pin kept for reproducibility.
