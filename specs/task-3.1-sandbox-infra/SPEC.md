# Task 3.1 — Sandbox infrastructure (slim MVP-1)

## Goal and context

Эта спецификация описывает задачу 3.1: инфраструктура codegen-песочницы Aider,
allowlist-прокси для egress и минимальный шаблон пользовательского Next.js
проекта. Без полного `code:execute` (это 3.3) — только то, на чём 3.3 строится.

## Users and roles

- **Инженер / платформа**: worker поднимает sandbox с hardening; registry-proxy
  фильтрует хосты.
- Конечный пользователь напрямую с sandbox не взаимодействует.

## Functional requirements

### Job "aider-sandbox image"

- **Scope**: mvp-1
- **Purpose**: образ Node 22 + Python + pinned Aider; runner читает задачу,
  гоняет Aider, gate (tsc/eslint/prettier/prisma validate), commit при успехе.
- API key только из `/run/secrets/api_key`.

### Job "registry-proxy"

- **Scope**: mvp-1
- HTTP forward + CONNECT; `ALLOWED_HOSTS`; `/health`.

### Job "user-nextjs template"

- **Scope**: mvp-1
- `templates/user-nextjs/` — минимальный App Router + Prisma scaffold.

### Job "worker sandbox options"

- **Scope**: mvp-1
- Хелпер `createSandboxContainer` options (hardening, secret mount, network).

## Non-functional requirements

- ReadonlyRootfs, CapDrop ALL, no-new-privileges, sandbox network only.
- Lint failure is fatal (`--max-warnings 0`).
- Aider pin `0.60.0` via ARG.

## Assumptions and open questions

- OQ #1,#2,#5,#6 resolved 2026-08-07 (see docs/12).
- `code:execute` wiring is Task 3.3.
