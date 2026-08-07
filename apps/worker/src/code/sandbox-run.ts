/**
 * Start Aider sandbox container, stream logs, wait, parse RESULT.
 * docker.sock is DEV-ONLY — warn like deploy.
 */

import { PassThrough } from 'node:stream';

import Docker from 'dockerode';
import { createRedisConnection } from '@aiflow/queue';

import { warnIfProdSocket, createDockerClient } from '../deploy/docker';
import { buildSandboxContainerOptions, type SandboxTaskEnv } from '../sandbox';
import { createLogPublisher } from './logs';
import { parseResultFromLogs, type SandboxResult } from './result';

export type RunSandboxInput = {
  workspaceHostPath: string;
  apiKeyHostPath: string;
  task: SandboxTaskEnv;
  schemaName: string;
  taskId: string;
  modelProvider?: string;
  modelName?: string;
  apiBaseUrl?: string;
  docker?: Docker;
  redis?: ReturnType<typeof createRedisConnection>;
};

export type RunSandboxOutput = {
  exitCode: number;
  result: SandboxResult | null;
  logs: string;
};

/** Create, start, stream, wait, remove sandbox container. */
export async function runSandboxContainer(input: RunSandboxInput): Promise<RunSandboxOutput> {
  warnIfProdSocket();
  const docker = input.docker ?? createDockerClient();
  const redis = input.redis ?? createRedisConnection();
  const ownRedis = !input.redis;
  const publisher = createLogPublisher({
    redis,
    schemaName: input.schemaName,
    taskId: input.taskId,
  });

  const opts = buildSandboxContainerOptions({
    workspaceHostPath: input.workspaceHostPath,
    apiKeyHostPath: input.apiKeyHostPath,
    task: input.task,
    modelProvider: input.modelProvider,
    modelName: input.modelName,
    apiBaseUrl: input.apiBaseUrl,
  });

  const container = await docker.createContainer(opts);
  let logs = '';
  try {
    await container.start();
    logs = await streamContainerLogs(container, docker, publisher.publish);
    const wait = (await container.wait()) as { StatusCode?: number };
    const exitCode = wait.StatusCode ?? 1;
    await publisher.close();
    return { exitCode, result: parseResultFromLogs(logs), logs };
  } finally {
    await publisher.close().catch(() => undefined);
    await container.remove({ force: true }).catch(() => undefined);
    if (ownRedis) await redis.quit().catch(() => undefined);
  }
}

async function streamContainerLogs(
  container: Docker.Container,
  docker: Docker,
  onChunk: (chunk: string) => Promise<void>,
): Promise<string> {
  const stream = await container.logs({
    follow: true,
    stdout: true,
    stderr: true,
  });
  return demuxAndCollect(docker, stream, onChunk);
}

function demuxAndCollect(
  docker: Docker,
  stream: NodeJS.ReadableStream,
  onChunk: (chunk: string) => Promise<void>,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let logs = '';
    const out = new PassThrough();
    const err = new PassThrough();
    const onData = (buf: Buffer) => {
      const chunk = buf.toString('utf8');
      logs += chunk;
      void onChunk(chunk);
    };
    out.on('data', onData);
    err.on('data', onData);
    docker.modem.demuxStream(stream, out, err);
    stream.on('end', () => {
      resolve(logs);
    });
    stream.on('error', (err: unknown) => {
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });
}
