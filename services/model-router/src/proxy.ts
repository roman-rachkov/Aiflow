/**
 * Chat completions proxy with primary + optional fallback upstream.
 * Caches non-streaming responses in Redis for 1 h.
 */

import type { Request, Response } from 'express';
import type { Redis } from 'ioredis';

import { makeCacheKey, tryGetCache, trySetCache } from './cache';

function resolveUrls(): { primary: string; fallback: string | null } {
  const base = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
  const fbBase = process.env.OPENAI_FALLBACK_BASE_URL ?? '';
  return {
    primary: base.replace(/\/$/, '') + '/chat/completions',
    fallback: fbBase ? fbBase.replace(/\/$/, '') + '/chat/completions' : null,
  };
}

function readAuthHeader(req: Request): string {
  const auth = req.headers.authorization;
  return typeof auth === 'string' ? auth : '';
}

export async function handleChatCompletions(
  req: Request,
  res: Response,
  redis: Redis | null,
): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const isStreaming = body.stream === true;
  const urls = resolveUrls();
  const auth = readAuthHeader(req);

  if (!isStreaming && redis) {
    await handleBuffered(res, redis, { urls, auth, body });
    return;
  }

  await handleStreaming(res, urls.primary, auth, body);
}

async function handleBuffered(
  res: Response,
  redis: Redis,
  input: {
    urls: { primary: string; fallback: string | null };
    auth: string;
    body: Record<string, unknown>;
  },
): Promise<void> {
  const { urls, auth, body } = input;
  const key = makeCacheKey(body);
  const cached = await tryGetCache(redis, key);
  if (cached) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Cache', 'HIT');
    res.send(cached);
    return;
  }

  const result = await tryForwardBuffered(urls.primary, auth, body);
  const used =
    result ?? (urls.fallback ? await tryForwardBuffered(urls.fallback, auth, body) : null);
  if (!used) {
    res.status(502).json({ error: 'All upstream providers failed' });
    return;
  }
  await trySetCache(redis, key, used);
  res.setHeader('Content-Type', 'application/json');
  res.send(used);
}

async function handleStreaming(
  res: Response,
  targetUrl: string,
  auth: string,
  body: Record<string, unknown>,
): Promise<void> {
  const upstream = await fetchUpstream(targetUrl, auth, body);
  if (!upstream) {
    res.status(502).json({ error: 'Upstream provider unreachable' });
    return;
  }
  res.status(upstream.status);
  upstream.headers.forEach((v, k) => res.setHeader(k, v));
  const reader = upstream.body?.getReader();
  if (!reader) {
    res.end();
    return;
  }
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (chunk.value) res.write(chunk.value);
    }
  } finally {
    res.end();
  }
}

async function fetchUpstream(
  url: string,
  auth: string,
  body: Record<string, unknown>,
): Promise<globalThis.Response | null> {
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

async function tryForwardBuffered(
  url: string,
  auth: string,
  body: Record<string, unknown>,
): Promise<string | null> {
  try {
    const resp = await fetchUpstream(url, auth, body);
    if (!resp || !resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  }
}
