/**
 * BullMQ handler for `deploy:run` — clone Gitea repo, dockerode build, update DB.
 * Job attempts are fail-fast (`attempts: 1` on the queue); build errors do not retry.
 */

import type { Job } from 'bullmq';
import type { DeployRunPayload } from '@aiflow/queue';

import { cloneRepo, deployWorkDir, removeWorkDir } from './clone';
import { buildDockerImage, warnIfProdSocket } from './docker';
import { appendDeployLog, finishDeploy } from './status';

export type DeployHandlerDeps = {
  cloneRepo: typeof cloneRepo;
  buildDockerImage: typeof buildDockerImage;
  appendDeployLog: typeof appendDeployLog;
  finishDeploy: typeof finishDeploy;
  removeWorkDir: typeof removeWorkDir;
  now: () => Date;
};

const defaultDeps: DeployHandlerDeps = {
  cloneRepo,
  buildDockerImage,
  appendDeployLog,
  finishDeploy,
  removeWorkDir,
  now: () => new Date(),
};

/** Validate payload fields; throws on missing/empty values. */
export function validateDeployPayload(data: DeployRunPayload): void {
  const required: (keyof DeployRunPayload)[] = [
    'projectId',
    'deploymentId',
    'schemaName',
    'giteaOwner',
    'giteaRepo',
    'giteaDefaultBranch',
  ];
  for (const key of required) {
    if (!data[key] || typeof data[key] !== 'string') {
      throw new Error(`Invalid deploy payload: missing ${key}`);
    }
  }
}

/** Build image tag `aistudio/{repo}:{shortStamp}`. */
export function makeImageTag(giteaRepo: string, now: Date): string {
  const stamp = now
    .toISOString()
    .replace(/[-:TZ.]/g, '')
    .slice(0, 14);
  return `aistudio/${giteaRepo}:${stamp}`;
}

/** Process one deploy:run job. Exported for unit tests with mocked deps. */
export async function handleDeployRun(
  job: Job<DeployRunPayload>,
  deps: DeployHandlerDeps = defaultDeps,
): Promise<void> {
  warnIfProdSocket();
  const payload = job.data;
  validateDeployPayload(payload);
  const workDir = deployWorkDir(payload.deploymentId);
  const imageTag = makeImageTag(payload.giteaRepo, deps.now());
  try {
    await runDeployPipeline(payload, workDir, imageTag, deps);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await deps.finishDeploy({
      schemaName: payload.schemaName,
      deploymentId: payload.deploymentId,
      status: 'FAILED',
      logChunk: `Ошибка сборки: ${message}\n`,
    });
    throw err;
  } finally {
    await deps.removeWorkDir(workDir);
  }
}

async function runDeployPipeline(
  payload: DeployRunPayload,
  workDir: string,
  imageTag: string,
  deps: DeployHandlerDeps,
): Promise<void> {
  await deps.appendDeployLog(
    payload.schemaName,
    payload.deploymentId,
    'Клонирование репозитория…\n',
  );
  await deps.cloneRepo({
    owner: payload.giteaOwner,
    repo: payload.giteaRepo,
    branch: payload.giteaDefaultBranch,
    workDir,
  });
  await deps.appendDeployLog(
    payload.schemaName,
    payload.deploymentId,
    `Сборка образа ${imageTag}…\n`,
  );
  await deps.buildDockerImage({
    contextDir: workDir,
    imageTag,
    onProgress: (line) => deps.appendDeployLog(payload.schemaName, payload.deploymentId, line),
  });
  await deps.finishDeploy({
    schemaName: payload.schemaName,
    deploymentId: payload.deploymentId,
    status: 'DEPLOYED',
    imageTag,
    url: `local://image/${imageTag}`,
    logChunk: `Образ собран: ${imageTag}\n`,
  });
}
