/**
 * LLM tracer contract + env factory (MVP-3 B2).
 * Disabled (noop) when LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY are unset.
 */

import { createLangfuseTracer } from './langfuse-tracer';
import { getTraceContext, rememberTraceId, resolveTraceId } from './trace-context';

/** Payload when ending a generation observation. */
export type GenerationEnd = {
  output?: unknown;
  tokensIn?: number | null;
  tokensOut?: number | null;
  level?: 'DEFAULT' | 'ERROR';
  statusMessage?: string;
};

/** Handle returned by {@link LlmTracer.startGeneration}. */
export type GenerationHandle = {
  traceId: string;
  end(result: GenerationEnd): void;
};

/** Start args for a chat/embed generation span. */
export type GenerationStart = {
  name: string;
  model: string;
  input: unknown;
  /** Parent Langfuse trace id (from {@link resolveTraceId}). */
  traceId?: string;
  metadata?: Record<string, unknown>;
};

/** Pluggable tracer — Langfuse when configured, else noop. */
export type LlmTracer = {
  readonly enabled: boolean;
  startGeneration(start: GenerationStart): GenerationHandle;
  flush(): Promise<void>;
};

const noopHandle = (): GenerationHandle => ({
  traceId: '',
  end() {
    /* no-op */
  },
});

/** No network, no ids — used when Langfuse env keys are absent. */
export const noopTracer: LlmTracer = {
  enabled: false,
  startGeneration() {
    return noopHandle();
  },
  flush() {
    return Promise.resolve();
  },
};

let cached: LlmTracer | undefined;

/** Test seam: drop the cached tracer so the next call re-reads env. */
export function resetTracerForTests(): void {
  cached = undefined;
}

/** Inject a tracer (tests). Pass `undefined` to clear back to env-driven. */
export function setTracerForTests(tracer: LlmTracer | undefined): void {
  cached = tracer;
}

/**
 * Resolve tracer from env once per process. Keys:
 * `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, optional `LANGFUSE_BASE_URL`.
 */
export function getTracerFromEnv(): LlmTracer {
  if (cached) return cached;
  cached = buildTracerFromEnv();
  return cached;
}

function buildTracerFromEnv(): LlmTracer {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY?.trim();
  const secretKey = process.env.LANGFUSE_SECRET_KEY?.trim();
  if (!publicKey || !secretKey) return noopTracer;
  const baseUrl = (process.env.LANGFUSE_BASE_URL ?? 'http://localhost:3100').replace(/\/$/, '');
  return createLangfuseTracer({ publicKey, secretKey, baseUrl });
}

/**
 * Start a generation, merging AsyncLocalStorage context into metadata.
 * Returns a noop handle when tracing is disabled.
 */
export function startTracedGeneration(
  tracer: LlmTracer,
  start: GenerationStart,
): GenerationHandle {
  if (!tracer.enabled) return noopHandle();
  const ctx = getTraceContext();
  const traceId = resolveTraceId();
  rememberTraceId(traceId);
  const metadata: Record<string, unknown> = { ...start.metadata };
  if (ctx?.role) metadata.role = ctx.role;
  if (ctx?.projectId) metadata.projectId = ctx.projectId;
  if (ctx?.taskId) metadata.taskId = ctx.taskId;
  return tracer.startGeneration({ ...start, traceId, metadata });
}
