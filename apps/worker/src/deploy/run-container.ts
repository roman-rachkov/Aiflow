/**
 * Launch a built Docker image as a named container with Traefik labels.
 *
 * Idempotent: if a container with the same name already exists it is removed
 * before the new one is created. Falls back to `docker://{tag}` when Traefik
 * domain deploy is disabled via `DEPLOY_DOMAIN_ENABLED != 'true'`.
 *
 * DEV-ONLY docker.sock caveat applies (same as docker.ts — OQ #4).
 */

import Docker from 'dockerode';

import { appDatabaseUrl } from '@aiflow/db';

import { createDockerClient } from './docker';

/** First 8 hex chars of the deployment UUID (dashes stripped). */
export function shortHex(deploymentId: string): string {
  return deploymentId.replace(/-/g, '').slice(0, 8).toLowerCase();
}

/** Stable container name — `aistudio-dep-{first8}`. */
export function containerName(deploymentId: string): string {
  return `aistudio-dep-${shortHex(deploymentId)}`;
}

/**
 * Build the Traefik-reachable public URL for a deployment.
 * Base defaults to `http://localhost:8090`; subdomain is `app-{hex}` prepended
 * to the base hostname so Traefik routes by Host header.
 */
export function buildDeployUrl(deploymentId: string): string {
  const base = process.env.DEPLOY_PUBLIC_BASE ?? 'http://localhost:8090';
  const hex = shortHex(deploymentId);
  try {
    const u = new URL(base);
    u.hostname = `app-${hex}.${u.hostname}`;
    return u.toString().replace(/\/$/, '');
  } catch {
    return `http://app-${hex}.localhost:8090`;
  }
}

export type RunContainerResult = {
  url: string;
  containerName: string;
};

export type RunContainerArgs = {
  docker?: Docker;
  deploymentId: string;
  imageTag: string;
  projectSchema: string;
  traefikNetwork?: string;
};

/**
 * Create (or re-create) a container from `imageTag` and return the deployment URL.
 *
 * When `DEPLOY_DOMAIN_ENABLED !== 'true'`, returns a `docker://` URL without
 * creating any container — backward-compatible fallback.
 */
export async function runDeployedContainer(args: RunContainerArgs): Promise<RunContainerResult> {
  const { deploymentId, imageTag, projectSchema } = args;
  const name = containerName(deploymentId);

  if (process.env.DEPLOY_DOMAIN_ENABLED !== 'true') {
    return { url: `docker://${imageTag}`, containerName: name };
  }

  const docker = args.docker ?? createDockerClient();
  const hex = shortHex(deploymentId);
  const subdomain = `app-${hex}`;
  const routerName = `dep-${hex}`;
  const network = args.traefikNetwork ?? process.env.TRAEFIK_NETWORK ?? 'internal';
  const dbUrl = appDatabaseUrl(projectSchema);

  await removeExistingContainer(docker, name);

  const container = await docker.createContainer({
    name,
    Image: imageTag,
    Env: [`DATABASE_URL=${dbUrl}`],
    ExposedPorts: { '3000/tcp': {} },
    Labels: buildTraefikLabels(routerName, subdomain),
    HostConfig: { NetworkMode: network },
  });

  await container.start();

  return { url: buildDeployUrl(deploymentId), containerName: name };
}

function buildTraefikLabels(routerName: string, subdomain: string): Record<string, string> {
  return {
    'traefik.enable': 'true',
    [`traefik.http.routers.${routerName}.rule`]: `Host(\`${subdomain}.localhost\`)`,
    [`traefik.http.routers.${routerName}.entrypoints`]: 'web',
    [`traefik.http.services.${routerName}.loadbalancer.server.port`]: '3000',
  };
}

async function removeExistingContainer(docker: Docker, name: string): Promise<void> {
  try {
    const existing = docker.getContainer(name);
    const info = await existing.inspect();
    if (info.State.Running) {
      await existing.stop();
    }
    await existing.remove();
  } catch {
    // Container did not exist — nothing to remove.
  }
}
