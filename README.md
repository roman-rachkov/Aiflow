# AI Studio

AI Studio превращает идею на естественном языке в задеплоенное веб-приложение: интервью с Аналитиком → `SPEC.md` → декомпозиция задач Планировщиком → генерация кода Coder-агентом в изолированном Docker-sandbox → деплой. Целевая аудитория — нетехнические пользователи; инженерам предоставляется редактор кода, Git-история и ручной деплой.

## Prerequisites

- Docker Engine ≥ 24 + Docker Compose v2
- Copy the environment template:

  ```bash
  cp .env.example .env
  ```

  Fill in secrets — at minimum `ENCRYPTION_KEY` (32-char random string) and your LLM provider credentials.

## Quick start

```bash
# 1. Start the full stack (postgres, redis, minio, gitea, app, worker, langfuse)
docker compose up

# 2. Seed a dev user (first run only)
docker compose exec app yarn workspace @aiflow/db seed:dev-user

# 3. Open the app
open http://localhost:3000
```

Sign in with the credentials printed by the seed command. Create a project, chat with the Analyst, approve `SPEC.md`, and generate a plan.

### Sandbox image (required for code generation)

Build once after cloning:

```bash
docker build -t aistudio/aider-sandbox:latest \
  -f docker/aider-sandbox/Dockerfile docker/aider-sandbox
```

## Contributing

Run the quality gate before every commit:

```bash
yarn verify   # typecheck → lint → format:check → test
yarn stabilization   # evals + load isolation + dogfood-smoke + prod-check
yarn dogfood-live    # live compose dogfood (requires Docker + LLM keys)
```

Production overlay: see `docs/prod-deployment.md` and `docker-compose.prod.yml`.

Individual checks: `yarn typecheck`, `yarn lint`, `yarn test`, `yarn format`.

All limits are enforced (`--max-warnings 0`): file ≤ 200 lines, function ≤ 50, complexity ≤ 10.

## Full documentation

See [docs/README.md](docs/README.md) for the full index: architecture, data model, roadmap, engineering conventions, and agent tooling.
