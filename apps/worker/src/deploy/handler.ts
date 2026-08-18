/**
 * BullMQ handler for `deploy:run` — clone Gitea repo, dockerode build, update DB.
 * Job attempts are fail-fast (`attempts: 1` on the queue); build errors do not retry.
 */

import type { Job } from 'bullmq';
import type { DeployRunPayload } from '@aiflow/queue';

import { pushUserAppSchema } from './app-schema-push';
import { cloneRepo, deployWorkDir, removeWorkDir } from './clone';
import { buildDockerImage, warnIfProdSocket } from './docker';
import { appendDeployLog, finishDeploy } from './status';

export type DeployHandlerDeps = {
  cloneRepo: typeof cloneRepo;
  buildDockerImage: typeof buildDockerImage;
  pushUserAppSchema: typeof pushUserAppSchema;
  appendDeployLog: typeof appendDeployLog;
  finishDeploy: typeof finishDeploy;
  removeWorkDir: typeof removeWorkDir;
  now: () => Date;
};

const defaultDeps: DeployHandlerDeps = {
  cloneRepo,
  buildDockerImage,
  pushUserAppSchema,
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
  const pushed = await deps.pushUserAppSchema(workDir, payload.schemaName);
  const url = `docker://${imageTag}`;
  await deps.finishDeploy({
    schemaName: payload.schemaName,
    deploymentId: payload.deploymentId,
    status: 'DEPLOYED',
    imageTag,
    url,
    logChunk: finishLog(imageTag, pushed.appSchema, pushed.skipped),
  });
}

function finishLog(imageTag: string, appSchema: string, skipped: boolean): string {
  const schemaLine = skipped
    ? 'prisma/schema.prisma нет — db push пропущен\n'
    : `Схема приложения: ${appSchema} (prisma db push выполнен)\n`;
  return (
    `Образ собран: ${imageTag}\n` +
    schemaLine +
    `Запуск: docker run --rm -p 3100:3000 -e DATABASE_URL=<schema=${skipped ? 'app_…' : appSchema}> ${imageTag}\n`
  );
}
