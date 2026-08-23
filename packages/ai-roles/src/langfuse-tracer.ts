/**
 * Thin Langfuse public-ingestion client (MVP-3 B2).
 * Uses fetch + Basic auth — no OTEL process bootstrap required for the leaf
 * package. Failures are swallowed so LLM calls never break on observability.
 */

import { randomUUID } from 'node:crypto';

import { getTraceContext } from './trace-context';
import type { GenerationEnd, GenerationHandle, GenerationStart, LlmTracer } from './tracer';

export type LangfuseTracerConfig = {
  publicKey: string;
  secretKey: string;
  baseUrl: string;
};

type IngestEvent = {
  id: string;
  type: string;
  timestamp: string;
  body: Record<string, unknown>;
};

/** Build a tracer that POSTs to `{baseUrl}/api/public/ingestion`. */
export function createLangfuseTracer(config: LangfuseTracerConfig): LlmTracer {
  const auth = Buffer.from(`${config.publicKey}:${config.secretKey}`).toString('base64');
  const url = `${config.baseUrl}/api/public/ingestion`;

  const enqueue = (batch: IngestEvent[]): void => {
    void postBatch(url, auth, batch).catch(() => {
      /* observability must not fail the LLM path */
    });
  };

  return {
    enabled: true,
    startGeneration(start: GenerationStart): GenerationHandle {
      return startLangfuseGeneration(start, enqueue);
    },
    async flush() {
      /* fire-and-forget client has nothing to drain synchronously */
    },
  };
}

function startLangfuseGeneration(
  start: GenerationStart,
  enqueue: (batch: IngestEvent[]) => void,
): GenerationHandle {
  const ctx = getTraceContext();
  const traceId = start.traceId && start.traceId.length > 0 ? start.traceId : randomUUID();
  const observationId = randomUUID();
  const startTime = new Date().toISOString();
  enqueue([
    {
      id: randomUUID(),
      type: 'trace-create',
      timestamp: startTime,
      body: buildTraceBody(traceId, startTime, start, ctx),
    },
    {
      id: randomUUID(),
      type: 'generation-create',
      timestamp: startTime,
      body: {
        id: observationId,
        traceId,
        name: start.name,
        startTime,
        model: start.model,
        input: start.input,
        metadata: start.metadata ?? {},
      },
    },
  ]);
  return {
    traceId,
    end(result: GenerationEnd) {
      enqueue([buildGenerationUpdate(observationId, result)]);
    },
  };
}

function buildTraceBody(
  traceId: string,
  startTime: string,
  start: GenerationStart,
  ctx: ReturnType<typeof getTraceContext>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    id: traceId,
    timestamp: startTime,
    name: ctx?.role ? `${ctx.role}:${start.name}` : start.name,
    metadata: start.metadata ?? {},
    tags: buildTags(ctx?.tags, ctx?.role),
  };
  if (ctx?.sessionId) body.sessionId = ctx.sessionId;
  if (ctx?.userId) body.userId = ctx.userId;
  return body;
}

function buildGenerationUpdate(observationId: string, result: GenerationEnd): IngestEvent {
  const endTime = new Date().toISOString();
  const body: Record<string, unknown> = {
    id: observationId,
    endTime,
    output: result.output,
  };
  if (result.level) body.level = result.level;
  if (result.statusMessage) body.statusMessage = result.statusMessage;
  const usage = usageFromTokens(result.tokensIn, result.tokensOut);
  if (usage) body.usage = usage;
  return { id: randomUUID(), type: 'generation-update', timestamp: endTime, body };
}

function usageFromTokens(
  tokensIn: number | null | undefined,
  tokensOut: number | null | undefined,
): Record<string, unknown> | undefined {
  if (tokensIn == null && tokensOut == null) return undefined;
  const input = tokensIn ?? 0;
  const output = tokensOut ?? 0;
  return { input, output, total: input + output, unit: 'TOKENS' };
}

function buildTags(extra: string[] | undefined, role: string | undefined): string[] {
  const tags = [...(extra ?? [])];
  if (role && !tags.includes(role)) tags.push(role);
  return tags;
}

async function postBatch(url: string, auth: string, batch: IngestEvent[]): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      'X-Langfuse-Sdk-Name': 'aiflow-ai-roles',
      'X-Langfuse-Sdk-Version': '0.1.0',
    },
    body: JSON.stringify({ batch }),
  });
  if (!response.ok) {
    throw new Error(`Langfuse ingest ${String(response.status)}`);
  }
}
