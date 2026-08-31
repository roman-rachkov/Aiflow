import type { DeployContext, RenderedTemplates } from './types';

/**
 * Platform deploy templates (mirrors `templates/*.tmpl`).
 * Embedded so Next.js route bundles do not depend on runtime file paths.
 */

const DOCKERFILE_TMPL = `# AI Studio generated Dockerfile (Node 22 / Next-compatible).
FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./
RUN if [ -f yarn.lock ]; then yarn install --frozen-lockfile; \\
  elif [ -f package-lock.json ]; then npm ci; \\
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm i --frozen-lockfile; \\
  else npm install; fi

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build || yarn build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["sh", "-c", "npm start || yarn start || node server.js || node .next/standalone/server.js"]
`;

const COMPOSE_TMPL = `# AI Studio generated compose — single app service.
services:
  app:
    image: {{IMAGE_NAME}}
    build: .
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      # Set DATABASE_URL to the platform Postgres with schema=app_{hex}.
    restart: unless-stopped
`;

/**
 * Optional support-bot sidecar appended to the compose file when
 * `SUPPORT_BOT_ENABLED=true`. The sidecar image (`aistudio/support-bot`) is a
 * lightweight Express service that forwards RAG + LLM queries; it is managed
 * by the platform operator and is opt-in per deployment.
 *
 * The sidecar exposes port 3001 internally and is reachable as
 * `http://support-bot:3001` from the `app` container within the same compose
 * network.
 */
const SUPPORT_BOT_SIDECAR_TMPL = `
  support-bot:
    image: aistudio/support-bot:latest
    environment:
      APP_URL: http://app:3000
      # OPENAI_BASE_URL / OPENAI_API_KEY must be set to enable RAG responses.
    restart: unless-stopped
`;

/** Short id for image names: first 8 hex chars of the project uuid (no dashes). */
export function shortProjectId(projectId: string): string {
  return projectId.replace(/-/g, '').slice(0, 8);
}

/** Image name `aistudio-project-{shortId}` used in compose templates. */
export function deployImageName(projectId: string): string {
  return `aistudio-project-${shortProjectId(projectId)}`;
}

/**
 * Render Dockerfile + compose from platform templates.
 *
 * When the env var `SUPPORT_BOT_ENABLED` is set to `"true"` (or `options.
 * includeSupportBot` is passed), a `support-bot` sidecar is appended to the
 * generated compose file (MVP-2 4.2 / MVP2-42-COMPOSE).
 */
export function renderDeployTemplates(
  project: DeployContext,
  options?: { includeSupportBot?: boolean },
): RenderedTemplates {
  const imageName = deployImageName(project.projectId);
  const dockerfile = DOCKERFILE_TMPL;

  const botEnabled = options?.includeSupportBot ?? process.env.SUPPORT_BOT_ENABLED === 'true';

  const compose =
    COMPOSE_TMPL.replaceAll('{{IMAGE_NAME}}', imageName) +
    (botEnabled ? SUPPORT_BOT_SIDECAR_TMPL : '');

  return { dockerfile, compose, imageName };
}
