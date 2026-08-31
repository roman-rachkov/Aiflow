/**
 * AsyncLocalStorage context for LLM tracing (MVP-3 B2).
 * Callers (workers/routes) set role/project/task; the provider wrapper reads it.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/** Metadata attached to Langfuse traces for a request / job. */
export type TraceContext = {
  role?: string;
  projectId?: string;
  taskId?: string;
  userId?: string;
  sessionId?: string;
  /** Shared across nested LLM calls in one job when set/mutated. */
  traceId?: string;
  tags?: string[];
};

type Store = TraceContext & { lastTraceId?: string };

const als = new AsyncLocalStorage<Store>();

/** Run `fn` with tracing metadata visible to the provider wrapper. */
export function runWithTraceContext<T>(ctx: TraceContext, fn: () => T): T {
  return als.run({ ...ctx }, fn);
}

/** Current store, if any (undefined outside {@link runWithTraceContext}). */
export function getTraceContext(): TraceContext | undefined {
  return als.getStore();
}

/** Most recent Langfuse trace id started in this context (for TaskLog/Audit). */
export function getCurrentTraceId(): string | undefined {
  const store = als.getStore();
  return store?.lastTraceId ?? store?.traceId;
}

/**
 * Resolve a stable trace id for this context: reuse `traceId` when present,
 * otherwise mint one and attach it so sibling LLM calls share a parent trace.
 */
export function resolveTraceId(): string {
  const store = als.getStore();
  if (store?.traceId) {
    store.lastTraceId = store.traceId;
    return store.traceId;
  }
  const id = randomUUID();
  if (store) {
    store.traceId = id;
    store.lastTraceId = id;
  }
  return id;
}

/** Record the active generation's trace id on the current store (if any). */
export function rememberTraceId(traceId: string): void {
  const store = als.getStore();
  if (store) store.lastTraceId = traceId;
}
