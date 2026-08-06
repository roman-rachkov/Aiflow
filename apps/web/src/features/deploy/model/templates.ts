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
RUN npm run build || yarn build || true

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

/** Render Dockerfile + compose from platform templates. */
export function renderDeployTemplates(project: DeployContext): RenderedTemplates {
  const imageName = deployImageName(project.projectId);
  const dockerfile = DOCKERFILE_TMPL;
  const compose = COMPOSE_TMPL.replaceAll('{{IMAGE_NAME}}', imageName);
  return { dockerfile, compose, imageName };
}
