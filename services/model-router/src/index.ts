/**
 * model-router — OpenAI-compatible proxy with fallback chain and Redis cache.
 * Ports:  3001 (HTTP)
 * Routes: GET  /health
 *         POST /v1/chat/completions  (proxy + 1h Redis cache)
 *         POST /v1/escalate          (advisor model route, no key storage)
 */

import express from 'express';
import { Redis } from 'ioredis';

import { handleChatCompletions } from './proxy';
import { handleEscalate } from './escalate';

const PORT = Number(process.env.PORT ?? 3001);
const REDIS_URL = process.env.REDIS_URL ?? '';

function createRedis(): Redis | null {
  if (!REDIS_URL) return null;
  try {
    const r = new Redis(REDIS_URL, { lazyConnect: true, enableOfflineQueue: false });
    r.on('error', (err: unknown) => {
      console.warn('[model-router] Redis error:', err);
    });
    return r;
  } catch {
    return null;
  }
}

const redis = createRedis();
const app = express();
app.use(express.json({ limit: '4mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/v1/chat/completions', (req, res) => {
  handleChatCompletions(req, res, redis).catch((err: unknown) => {
    console.error('[model-router] chat/completions error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Internal error' });
  });
});

app.post('/v1/escalate', (req, res) => {
  handleEscalate(req, res).catch((err: unknown) => {
    console.error('[model-router] escalate error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Internal error' });
  });
});

app.listen(PORT, () => {
  console.log(`[model-router] listening on ${String(PORT)}`);
  console.log(`[model-router] primary: ${process.env.OPENAI_BASE_URL ?? '(default openai)'}`);
  console.log(`[model-router] fallback: ${process.env.OPENAI_FALLBACK_BASE_URL ?? '(none)'}`);
  console.log(`[model-router] redis: ${REDIS_URL ? 'connected' : 'disabled'}`);
});
