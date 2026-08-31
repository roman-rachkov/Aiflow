/**
 * Bull Board dev-only dashboard — exposes BullMQ queue state on port 3030.
 *
 * Auth is optional in dev. Set BULL_BOARD_USER / BULL_BOARD_PASSWORD in .env
 * to enable HTTP Basic auth. Leave both empty to skip auth (compose default).
 *
 * All 6 platform queues are registered: spec-generate, plan-generate,
 * code-execute, code-review, deploy-run, chat-run.
 *
 * Usage: tsx src/index.ts  (or via docker compose `bull-board` service)
 */

import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import express from 'express';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, createRedisConnection } from '@aiflow/queue';

const PORT = parseInt(process.env.BULL_BOARD_PORT ?? '3030', 10);
const BOARD_USER = process.env.BULL_BOARD_USER ?? '';
const BOARD_PASSWORD = process.env.BULL_BOARD_PASSWORD ?? '';
const BASE_PATH = '/';
const PORT_STR = String(PORT);

const redis = createRedisConnection();

const queues = QUEUE_NAMES.map((name) => new Queue(name, { connection: redis }));

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath(BASE_PATH);

createBullBoard({
  queues: queues.map((q) => new BullMQAdapter(q)),
  serverAdapter,
});

const app = express();

if (BOARD_USER && BOARD_PASSWORD) {
  // Basic auth guard — only active when credentials are set.
  app.use((req, res, next) => {
    const authHeader = req.headers.authorization ?? '';
    const encoded = Buffer.from(`${BOARD_USER}:${BOARD_PASSWORD}`).toString('base64');
    if (authHeader === `Basic ${encoded}`) {
      next();
      return;
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="Bull Board"');
    res.status(401).send('Unauthorized');
  });
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- bull-board router is untyped
app.use(BASE_PATH, serverAdapter.getRouter());

app.listen(PORT, '0.0.0.0', () => {
  const auth = BOARD_USER ? ' (auth enabled)' : ' (no auth — dev only)';
  console.log(`Bull Board listening on http://0.0.0.0:${PORT_STR}${auth}`);
});
