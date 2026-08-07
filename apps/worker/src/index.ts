/**
 * BullMQ worker entry — listens to queues listed in `QUEUES`.
 * Real handlers: `deploy:run`, `plan:generate`, `code:execute`.
 *
 * dockerode lives here only. Next.js must never import it.
 * docker.sock mount in compose is DEV-ONLY (see open question #4).
 */

import { Worker } from 'bullmq';
import {
  createRedisConnection,
  QUEUE_CODE_EXECUTE,
  QUEUE_DEPLOY_RUN,
  QUEUE_NAMES,
  QUEUE_PLAN_GENERATE,
  type CodeExecutePayload,
  type DeployRunPayload,
  type PlanGeneratePayload,
  type QueueName,
} from '@aiflow/queue';

import { handleCodeExecute } from './code/handler';
import { handleDeployRun } from './deploy/handler';
import { handlePlanGenerate } from './plan/handler';

function parseQueues(): QueueName[] {
  const raw = process.env.QUEUES ?? QUEUE_DEPLOY_RUN;
  const wanted = new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return QUEUE_NAMES.filter((name) => wanted.has(name));
}

function jobId(id: string | undefined): string {
  return id ?? '(unknown)';
}

function start(): void {
  const queues = parseQueues();
  console.log(`[worker] starting queues: ${queues.join(', ')}`);

  for (const name of queues) {
    const connection = createRedisConnection();
    if (name === QUEUE_DEPLOY_RUN) {
      startDeployWorker(connection);
      continue;
    }
    if (name === QUEUE_PLAN_GENERATE) {
      startPlanWorker(connection);
      continue;
    }
    if (name === QUEUE_CODE_EXECUTE) {
      startCodeWorker(connection);
      continue;
    }
    startStubWorker(name, connection);
  }
}

function startDeployWorker(connection: ReturnType<typeof createRedisConnection>): void {
  const worker = new Worker<DeployRunPayload>(QUEUE_DEPLOY_RUN, (job) => handleDeployRun(job), {
    connection,
    concurrency: 1,
  });
  bindWorkerLogs(worker, 'deploy:run');
}

function startPlanWorker(connection: ReturnType<typeof createRedisConnection>): void {
  const worker = new Worker<PlanGeneratePayload>(
    QUEUE_PLAN_GENERATE,
    (job) => handlePlanGenerate(job),
    { connection, concurrency: 1 },
  );
  bindWorkerLogs(worker, 'plan:generate');
}

function startCodeWorker(connection: ReturnType<typeof createRedisConnection>): void {
  const worker = new Worker<CodeExecutePayload>(
    QUEUE_CODE_EXECUTE,
    (job) => handleCodeExecute(job),
    { connection, concurrency: 1 },
  );
  bindWorkerLogs(worker, 'code:execute');
}

function bindWorkerLogs(worker: Worker, label: string): void {
  worker.on('failed', (job, err) => {
    console.error(`[worker] ${label} failed job=${jobId(job?.id)}:`, err.message);
  });
  worker.on('completed', (job) => {
    console.log(`[worker] ${label} completed job=${jobId(job.id)}`);
  });
}

function startStubWorker(
  name: QueueName,
  connection: ReturnType<typeof createRedisConnection>,
): void {
  const stub = new Worker(
    name,
    (job) => {
      console.log(`[worker] stub ack ${name} job=${jobId(job.id)}`);
      return Promise.resolve();
    },
    { connection, concurrency: 1 },
  );
  stub.on('failed', (job, err) => {
    console.error(`[worker] stub ${name} failed job=${jobId(job?.id)}:`, err.message);
  });
}

start();
