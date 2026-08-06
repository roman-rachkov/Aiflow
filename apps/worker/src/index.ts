/**
 * BullMQ worker entry — listens to queues listed in `QUEUES`.
 * Only `deploy:run` has a real handler; other queues are no-op stubs (MVP-0).
 *
 * dockerode lives here only. Next.js must never import it.
 * docker.sock mount in compose is DEV-ONLY (see open question #4).
 */

import { Worker } from 'bullmq';
import {
  createRedisConnection,
  QUEUE_DEPLOY_RUN,
  QUEUE_NAMES,
  type DeployRunPayload,
  type QueueName,
} from '@aiflow/queue';

import { handleDeployRun } from './deploy/handler';

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
    startStubWorker(name, connection);
  }
}

function startDeployWorker(connection: ReturnType<typeof createRedisConnection>): void {
  const worker = new Worker<DeployRunPayload>(QUEUE_DEPLOY_RUN, (job) => handleDeployRun(job), {
    connection,
    concurrency: 1,
  });
  worker.on('failed', (job, err) => {
    console.error(`[worker] deploy:run failed job=${jobId(job?.id)}:`, err.message);
  });
  worker.on('completed', (job) => {
    console.log(`[worker] deploy:run completed job=${jobId(job.id)}`);
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
