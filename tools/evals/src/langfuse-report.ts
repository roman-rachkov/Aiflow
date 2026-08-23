/**
 * Optional Langfuse dataset-run reporting (MVP-3 B3).
 * Noop when LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY are unset.
 */

import { randomUUID } from 'node:crypto';

import type { CheckResult } from './types.ts';

type LangfuseKeys = { publicKey: string; secretKey: string; baseUrl: string };

/** Report eval check scores to Langfuse; returns whether anything was sent. */
export async function reportEvalScores(checks: CheckResult[]): Promise<boolean> {
  const keys = readLangfuseKeys();
  if (!keys) return false;
  const traceId = randomUUID();
  const now = new Date().toISOString();
  const batch = [
    {
      id: randomUUID(),
      type: 'trace-create',
      timestamp: now,
      body: {
        id: traceId,
        name: 'evals:golden',
        timestamp: now,
        tags: ['evals', 'b3'],
        metadata: { suite: 'golden-spec-plan-code' },
      },
    },
    ...checks.map((check) => scoreEvent(traceId, check, now)),
  ];
  await postIngest(keys, batch);
  return true;
}

function readLangfuseKeys(): LangfuseKeys | null {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY?.trim();
  const secretKey = process.env.LANGFUSE_SECRET_KEY?.trim();
  if (!publicKey || !secretKey) return null;
  const baseUrl = (process.env.LANGFUSE_BASE_URL ?? 'http://localhost:3100').replace(/\/$/, '');
  return { publicKey, secretKey, baseUrl };
}

function scoreEvent(
  traceId: string,
  check: CheckResult,
  timestamp: string,
): Record<string, unknown> {
  return {
    id: randomUUID(),
    type: 'score-create',
    timestamp,
    body: {
      id: randomUUID(),
      traceId,
      name: check.name,
      value: check.ok ? 1 : 0,
      dataType: 'BOOLEAN',
      comment: check.detail ?? (check.ok ? 'pass' : 'fail'),
    },
  };
}

async function postIngest(keys: LangfuseKeys, batch: Record<string, unknown>[]): Promise<void> {
  const auth = Buffer.from(`${keys.publicKey}:${keys.secretKey}`).toString('base64');
  const response = await fetch(`${keys.baseUrl}/api/public/ingestion`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      'X-Langfuse-Sdk-Name': 'aiflow-evals',
      'X-Langfuse-Sdk-Version': '0.1.0',
    },
    body: JSON.stringify({ batch }),
  });
  if (!response.ok) {
    throw new Error(`Langfuse eval report ${String(response.status)}`);
  }
}
