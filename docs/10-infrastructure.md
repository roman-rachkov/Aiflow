# AI Studio — Infrastructure Configuration (Docker Compose)

```yaml
# =============================================================================
# AI Studio — Infrastructure configuration (Docker Compose)
# Version: 1.0.0-MVP
# Supports two modes:
#   - dev:  all services on one host, relaxed security, hot reload,
#           ports exposed for debugging.
#   - prod: frontend/backend/workers split, external reverse proxy,
#           hardened isolation, healthchecks and resource limits.
# Switched via the ENVIRONMENT=dev|prod variable.
# =============================================================================

version: "3.9"

x-common-env: &common-env
  ENVIRONMENT: ${ENVIRONMENT:-dev}
  # Primary database
  DATABASE_URL: postgresql://${POSTGRES_USER:-ai_studio}:${POSTGRES_PASSWORD:-ai_studio}@postgres:5432/ai_studio?schema=public
  # Redis
  REDIS_URL: redis://redis:6379
  # MinIO (S3-compatible storage)
  S3_ENDPOINT: minio:9000
  S3_ACCESS_KEY: ${S3_ACCESS_KEY:-minioadmin}
  S3_SECRET_KEY: ${S3_SECRET_KEY:-minioadmin}
  S3_BUCKET: ai-studio
  # Gitea
  GITEA_URL: http://gitea:3000
  GITEA_ADMIN_TOKEN: ${GITEA_ADMIN_TOKEN:-admin_token}
  # AI Router
  AI_ROUTER_URL: http://model-router:3001
  # Encryption
  ENCRYPTION_KEY: ${ENCRYPTION_KEY:-change-me-in-production-32bytes!}
  # NextAuth
  NEXTAUTH_URL: http://localhost:3000
  NEXTAUTH_SECRET: ${NEXTAUTH_SECRET:-change-me}

x-healthcheck-defaults: &healthcheck-defaults
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s

services:
  # ===========================================================================
  # PostgreSQL — primary database
  # ===========================================================================
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-ai_studio}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-ai_studio}
      POSTGRES_DB: ai_studio
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./db/init:/docker-entrypoint-initdb.d   # initialization scripts
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-ai_studio} -d ai_studio"]
      <<: *healthcheck-defaults
    networks:
      - internal
    restart: unless-stopped

  # ===========================================================================
  # Redis — BullMQ queues and cache
  # ===========================================================================
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      <<: *healthcheck-defaults
    networks:
      - internal
    restart: unless-stopped

  # ===========================================================================
  # MinIO — object storage (user files, assets)
  # ===========================================================================
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${S3_ACCESS_KEY:-minioadmin}
      MINIO_ROOT_PASSWORD: ${S3_SECRET_KEY:-minioadmin}
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      <<: *healthcheck-defaults
    networks:
      - internal
    restart: unless-stopped

  # ===========================================================================
  # Gitea — Git server (one repository per project)
  # ===========================================================================
  gitea:
    image: gitea/gitea:1.22
    environment:
      USER_UID: 1000
      USER_GID: 1000
      GITEA__server__DOMAIN: localhost
      GITEA__server__SSH_DOMAIN: localhost
      GITEA__server__ROOT_URL: http://localhost:3002/
      GITEA__security__INSTALL_LOCK: "true"
      GITEA__security__SECRET_KEY: ${GITEA_SECRET_KEY:-change-me}
    ports:
      # Gitea listens on 3000 inside the container (its default); externally
      # it is published on 3002 to avoid clashing with the Next.js app.
      # Platform services reach it over the internal network as gitea:3000.
      - "3002:3000"
    volumes:
      - gitea_data:/data
      - /etc/timezone:/etc/timezone:ro
      - /etc/localtime:/etc/localtime:ro
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/healthcheck"]
      <<: *healthcheck-defaults
    networks:
      - internal
    restart: unless-stopped

  # ===========================================================================
  # Model Router — unified access to AI providers
  # ===========================================================================
  model-router:
    build:
      context: ./model-router
      dockerfile: Dockerfile
    environment:
      <<: *common-env
      PORT: 3001
    volumes:
      # In dev mode, mount sources for hot reload
      - ./model-router/src:/app/src:ro
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      <<: *healthcheck-defaults
    networks:
      - internal
    restart: unless-stopped

  # ===========================================================================
  # Next.js application (monolith: frontend + API)
  # ===========================================================================
  app:
    build:
      context: .
      dockerfile: Dockerfile
      target: ${ENVIRONMENT:-dev}
    environment:
      <<: *common-env
      PORT: 3000
    volumes:
      # In dev mode, mount sources for hot reload
      - ./src:/app/src:ro
      - ./public:/app/public:ro
      - ./prisma:/app/prisma:ro
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      minio:
        condition: service_healthy
      gitea:
        condition: service_healthy
      model-router:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      <<: *healthcheck-defaults
    networks:
      - internal
    restart: unless-stopped

  # ===========================================================================
  # BullMQ workers (separate processes for background tasks)
  # ===========================================================================
  worker:
    build:
      context: .
      dockerfile: Dockerfile.worker
    environment:
      <<: *common-env
      QUEUES: "spec:generate,plan:generate,code:execute,deploy:run"
    volumes:
      # Docker socket for sandbox management (dev only)
      - /var/run/docker.sock:/var/run/docker.sock
      - worker_temp:/tmp/sandbox
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - internal
      - sandbox  # access to the sandbox network
    restart: unless-stopped
    # In production, multiple replicas can be run:
    # deploy:
    #   replicas: 3

  # ===========================================================================
  # Package registry proxy (sandbox isolation)
  # ===========================================================================
  registry-proxy:
    build:
      context: ./registry-proxy
      dockerfile: Dockerfile
    environment:
      ALLOWED_HOSTS: "registry.npmjs.org,registry.yarnpkg.com,pypi.org,github.com"
    networks:
      - sandbox
    restart: unless-stopped
    # The proxy has no access to the internal network

networks:
  internal:
    # Internal network for platform services
    driver: bridge
  sandbox:
    # Isolated network for sandboxes, connected only to worker and registry-proxy
    driver: bridge
    internal: true  # blocks outbound internet traffic except via registry-proxy

volumes:
  postgres_data:
  redis_data:
  minio_data:
  gitea_data:
  worker_temp:
```

## Notes

### Expected project layout

```
ai-studio/
├── docker-compose.yml        # this file
├── Dockerfile                # for the app service (Next.js)
├── Dockerfile.worker         # for BullMQ workers
├── model-router/
│   ├── Dockerfile
│   └── src/
├── registry-proxy/
│   ├── Dockerfile
│   └── ...
├── db/
│   └── init/                 # database initialization scripts
├── src/                      # Next.js sources
├── prisma/
│   └── schema.prisma
└── ...
```

### Running in development mode

```bash
ENVIRONMENT=dev docker compose up --build
```

- The Next.js app starts with hot reload (dev target in the Dockerfile).
- The worker uses the mounted Docker socket to create sandboxes (docker-in-docker not required).
- All ports are available locally: 3000 — app, 3001 — model-router, 3002 — Gitea, 5432 — PostgreSQL, 6379 — Redis, 9000 — MinIO API, 9001 — MinIO Console.

### Port allocation

Gitea listens on 3000 *inside* its container — that is its default and there is no reason to change it: platform services reach it over the internal network as `gitea:3000`. Externally it is published on 3002, so `GITEA__server__ROOT_URL` is `http://localhost:3002/`. Host port 3000 belongs to the Next.js app.

Both numbers are correct in their own context. Do not "fix" one to match the other.

### Moving to production

1. Set `ENVIRONMENT=prod`.
2. Switch `build.target` to `prod` in the Dockerfile (multi-stage build).
3. Add an external reverse proxy (Traefik, Nginx) in front of the app service.
4. Scale workers with `docker compose up --scale worker=3`.
5. Move PostgreSQL, Redis, MinIO to managed services and remove them from compose.
6. Replace `/var/run/docker.sock` with a remote Docker runner (dockerode with TLS) or use Kubernetes for sandboxes.
7. Configure secrets via Docker Secrets / Vault instead of environment variables.

### Security

- The `sandbox` network is isolated: sandbox containers cannot reach the `internal` network where the database and other services live. The only route out is `registry-proxy` with its host allowlist.
- In production the Docker socket mount must be removed in favor of a remote Docker daemon with authentication.
- Default passwords and keys are for development only; production values come from a secure store.

### Dockerfile for app (Next.js, multi-stage)

```dockerfile
# Dockerfile
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM base AS dev
COPY . .
CMD ["npm", "run", "dev"]

FROM base AS prod
COPY . .
RUN npm run build
CMD ["npm", "start"]
```

### Dockerfile for worker

```dockerfile
# Dockerfile.worker
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
CMD ["node", "dist/workers/index.js"]
```

This keeps things flexible: a developer starts everything locally with one command, while production services can be split out and scaled independently.
