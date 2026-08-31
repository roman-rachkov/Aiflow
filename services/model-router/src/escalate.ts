/**
 * POST /v1/escalate — routes a second request to the advisor model.
 * API key is accepted as plain string or AES-256-GCM encrypted envelope
 * (same shape as @aiflow/crypto). The plaintext key is wiped after use.
 */

import { createDecipheriv } from 'node:crypto';
import type { Request, Response } from 'express';

type EncryptedEnvelope = { __encrypted__: string };

function isEncryptedEnvelope(v: unknown): v is EncryptedEnvelope {
  return (
    typeof v === 'object' &&
    v !== null &&
    '__encrypted__' in v &&
    typeof (v as Record<string, unknown>).__encrypted__ === 'string'
  );
}

/** Decrypt an AES-256-GCM envelope: iv(12)||tag(16)||ciphertext. */
function decryptEnvelope(env: EncryptedEnvelope): string {
  const rawKey = process.env.ENCRYPTION_KEY;
  if (!rawKey) throw new Error('ENCRYPTION_KEY not set');
  const packed = Buffer.from(env.__encrypted__, 'base64');
  if (packed.length < 29) throw new Error('Encrypted envelope too short');
  const keyBuf = Buffer.from(rawKey, 'base64');
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const ciphertext = packed.subarray(28);
  const dec = createDecipheriv('aes-256-gcm', keyBuf, iv);
  dec.setAuthTag(tag);
  return Buffer.concat([dec.update(ciphertext), dec.final()]).toString('utf8');
}

function resolveApiKey(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === 'string') return raw || null;
  if (isEncryptedEnvelope(raw)) return decryptEnvelope(raw);
  throw new Error('apiKey must be a string or encrypted envelope');
}

type EscalateBody = {
  role?: string;
  messages?: unknown[];
  primaryModel?: string;
  advisorModel?: string;
  apiKey?: unknown;
};

export async function handleEscalate(req: Request, res: Response): Promise<void> {
  const { messages, advisorModel, apiKey } = req.body as EscalateBody;
  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: 'messages array required' });
    return;
  }
  if (!advisorModel || typeof advisorModel !== 'string') {
    res.status(400).json({ error: 'advisorModel required' });
    return;
  }

  let plainKey: string | null = null;
  try {
    plainKey = resolveApiKey(apiKey);
  } catch (err) {
    res.status(400).json({ error: String(err) });
    return;
  }

  const base = (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (plainKey) headers.Authorization = `Bearer ${plainKey}`;

  try {
    const resp = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: advisorModel, messages, stream: false }),
    });
    if (!resp.ok) {
      res.status(resp.status).json({ error: 'Advisor upstream returned error' });
      return;
    }
    const data: unknown = await resp.json();
    res.json(data);
  } catch {
    res.status(502).json({ error: 'Advisor request failed' });
  } finally {
    plainKey = null; // wipe reference
  }
}
