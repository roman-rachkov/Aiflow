/**
 * Pro-gated deploy + Gitea tree/file tools for chat:run.
 */

import { randomUUID } from 'node:crypto';

import { getProjectClient, getPublicClient } from '@aiflow/db';
import { getDeployQueue } from '@aiflow/queue';

import { readGiteaAdminToken } from '../gitea-token';

import type { ToolExecContext, ToolResult } from './tool-execute';

const PRO_REQUIRED = 'Требуется Pro';
const INITIAL_LOG = 'Сборка поставлена в очередь\n';
const TIMEOUT_MS = 15_000;

function requirePro(ctx: ToolExecContext, heading: string): ToolResult | null {
  if (ctx.uiMode === 'PRO') return null;
  return { heading, content: { error: PRO_REQUIRED }, error: true };
}

function errResult(heading: string, message: string): ToolResult {
  return { heading, content: { error: message }, error: true };
}

function asRecord(args: unknown): Record<string, unknown> {
  return args && typeof args === 'object' && !Array.isArray(args)
    ? (args as Record<string, unknown>)
    : {};
}

function strField(args: unknown, key: string): string | undefined {
  const v = asRecord(args)[key];
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
}

type GiteaMeta = {
  schemaName: string;
  giteaOwner: string;
  giteaRepo: string;
  giteaDefaultBranch: string;
};

/** Create BUILDING deployment + enqueue (skips template export — chat path). */
export async function executeDeploy(ctx: ToolExecContext): Promise<ToolResult> {
  const gated = requirePro(ctx, 'deploy');
  if (gated) return gated;
  try {
    const meta = await loadGiteaMeta(ctx.projectId, ctx.ownerId);
    if (!meta) return errResult('deploy', 'Проект не найден');
    if (await findBuilding(meta.schemaName, ctx.projectId)) {
      return errResult('deploy', 'Уже идёт сборка');
    }
    const deploymentId = await insertBuilding(ctx.projectId, meta);
    await enqueueDeploy(ctx.projectId, deploymentId, meta);
    return { heading: 'Деплой', content: { deploymentId, status: 'BUILDING' } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось запустить деплой';
    return errResult('deploy', message);
  }
}

async function enqueueDeploy(
  projectId: string,
  deploymentId: string,
  meta: GiteaMeta,
): Promise<void> {
  await getDeployQueue().add(
    'deploy:run',
    {
      projectId,
      deploymentId,
      schemaName: meta.schemaName,
      giteaOwner: meta.giteaOwner,
      giteaRepo: meta.giteaRepo,
      giteaDefaultBranch: meta.giteaDefaultBranch,
    },
    { jobId: deploymentId },
  );
}

async function findBuilding(schemaName: string, projectId: string): Promise<boolean> {
  const existing = await getProjectClient(schemaName).deployment.findFirst({
    where: { projectId, status: 'BUILDING', deletedAt: null },
    select: { id: true },
  });
  return existing != null;
}

async function insertBuilding(projectId: string, meta: GiteaMeta): Promise<string> {
  const deploymentId = randomUUID();
  await getProjectClient(meta.schemaName).deployment.create({
    data: {
      id: deploymentId,
      projectId,
      status: 'BUILDING',
      log: INITIAL_LOG,
      url: null,
      imageTag: null,
      deletedAt: null,
    },
  });
  await getPublicClient().deploymentMeta.create({
    data: { id: deploymentId, projectId, status: 'BUILDING', url: null, deletedAt: null },
  });
  return deploymentId;
}

/** List repo tree entries (Pro). */
export async function executeListFiles(ctx: ToolExecContext, args: unknown): Promise<ToolResult> {
  const gated = requirePro(ctx, 'list_files');
  if (gated) return gated;
  try {
    const meta = await loadGiteaMeta(ctx.projectId, ctx.ownerId);
    if (!meta) return errResult('list_files', 'Проект не найден');
    const ref = strField(args, 'ref') ?? meta.giteaDefaultBranch;
    const pathPrefix = strField(args, 'path');
    const tree = await giteaTree(meta.giteaOwner, meta.giteaRepo, ref);
    const filtered = pathPrefix
      ? tree.filter((e) => e.path === pathPrefix || e.path.startsWith(`${pathPrefix}/`))
      : tree;
    return { heading: 'Файлы', content: { tree: filtered } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось прочитать дерево';
    return errResult('list_files', message);
  }
}

/** Read one file from the project repo (Pro). */
export async function executeReadFile(ctx: ToolExecContext, args: unknown): Promise<ToolResult> {
  const gated = requirePro(ctx, 'read_file');
  if (gated) return gated;
  const path = strField(args, 'path');
  if (!path) return errResult('read_file', 'Укажите path');
  try {
    const meta = await loadGiteaMeta(ctx.projectId, ctx.ownerId);
    if (!meta) return errResult('read_file', 'Проект не найден');
    const ref = strField(args, 'ref') ?? meta.giteaDefaultBranch;
    const file = await giteaFile(meta.giteaOwner, meta.giteaRepo, path, ref);
    return { heading: path, content: { path: file.path, content: file.content, sha: file.sha } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось прочитать файл';
    return errResult('read_file', message);
  }
}

async function loadGiteaMeta(projectId: string, ownerId: string): Promise<GiteaMeta | null> {
  const meta = await getPublicClient().projectMeta.findUnique({
    where: { id: projectId, deletedAt: null },
    select: {
      ownerId: true,
      schemaName: true,
      giteaOwner: true,
      giteaRepo: true,
      giteaDefaultBranch: true,
    },
  });
  if (!meta || meta.ownerId !== ownerId || !meta.giteaOwner || !meta.giteaRepo) return null;
  return {
    schemaName: meta.schemaName,
    giteaOwner: meta.giteaOwner,
    giteaRepo: meta.giteaRepo,
    giteaDefaultBranch: meta.giteaDefaultBranch || 'main',
  };
}

async function giteaTree(
  owner: string,
  repo: string,
  ref: string,
): Promise<Array<{ path: string; type: string; sha: string }>> {
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const raw = await giteaJson<{ tree?: Array<{ path: string; type: string; sha: string }> }>(
    `${base}/git/trees/${encodeURIComponent(ref)}?recursive=true`,
  );
  return (raw.tree ?? []).map((e) => ({ path: e.path, type: e.type, sha: e.sha }));
}

async function giteaFile(
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<{ path: string; content: string; sha: string }> {
  const encoded = path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const raw = await giteaJson<{
    path: string;
    sha: string;
    content?: string | null;
    encoding?: string;
  }>(`${base}/contents/${encoded}?ref=${encodeURIComponent(ref)}`);
  let content = '';
  if (raw.content) {
    content =
      raw.encoding === 'base64' || raw.encoding == null
        ? Buffer.from(raw.content.replace(/\n/g, ''), 'base64').toString('utf8')
        : raw.content;
  }
  return { path: raw.path, content, sha: raw.sha };
}

async function giteaJson<T>(path: string): Promise<T> {
  const baseUrl = (process.env.GITEA_URL ?? '').replace(/\/+$/, '');
  const token = readGiteaAdminToken();
  if (!baseUrl || !token) throw new Error('Gitea is not configured');
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/api/v1${path}`, {
      signal: controller.signal,
      headers: { Authorization: `token ${token}`, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Gitea HTTP ${String(res.status)}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
