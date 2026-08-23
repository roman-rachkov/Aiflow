/**
 * Tests for Langfuse tracing enable/disable (MVP-3 B2).
 * Stub fetch — never hits a real Langfuse or LLM endpoint.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createOpenAICompatibleProvider } from './openai-compatible';
import { getCurrentTraceId, runWithTraceContext } from './trace-context';
import {
  getTracerFromEnv,
  noopTracer,
  resetTracerForTests,
  setTracerForTests,
  type GenerationEnd,
  type GenerationHandle,
  type GenerationStart,
  type LlmTracer,
} from './tracer';
import type { ProviderConfig } from './types';

const MOCK_CONFIG: ProviderConfig = {
  baseURL: 'https://example.test/v1',
  chatModel: 'glm-4.6',
  embeddingModel: 'text-embedding-3-small',
};

afterEach(() => {
  vi.unstubAllGlobals();
  resetTracerForTests();
  delete process.env.LANGFUSE_PUBLIC_KEY;
  delete process.env.LANGFUSE_SECRET_KEY;
  delete process.env.LANGFUSE_BASE_URL;
});

describe('getTracerFromEnv', () => {
  it('returns noop when Langfuse keys are unset', () => {
    resetTracerForTests();
    expect(getTracerFromEnv().enabled).toBe(false);
  });

  it('returns an enabled tracer when public+secret keys are set', () => {
    process.env.LANGFUSE_PUBLIC_KEY = 'pk-test';
    process.env.LANGFUSE_SECRET_KEY = 'sk-test';
    process.env.LANGFUSE_BASE_URL = 'http://langfuse.test';
    resetTracerForTests();
    expect(getTracerFromEnv().enabled).toBe(true);
  });
});

describe('createOpenAICompatibleProvider without Langfuse', () => {
  it('still streams mock chat when tracing is disabled', async () => {
    setTracerForTests(noopTracer);
    const provider = createOpenAICompatibleProvider(MOCK_CONFIG);
    const chunks: string[] = [];
    for await (const c of provider.chat([{ role: 'USER', content: 'hi' }], {
      model: 'm',
      systemPrompt: 's',
    })) {
      chunks.push(c);
    }
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('still embeds in mock mode when tracing is disabled', async () => {
    setTracerForTests(noopTracer);
    const provider = createOpenAICompatibleProvider(MOCK_CONFIG);
    const vectors = await provider.embed(['x']);
    expect(vectors).toHaveLength(1);
    expect(vectors[0]).toHaveLength(768);
  });
});

describe('createOpenAICompatibleProvider with Langfuse tracer', () => {
  it('emits start+end and exposes traceId via ALS', async () => {
    const ends: GenerationEnd[] = [];
    const starts: GenerationStart[] = [];
    const tracer = recordingTracer(starts, ends);
    setTracerForTests(tracer);

    const provider = createOpenAICompatibleProvider(MOCK_CONFIG, { tracer });
    await runWithTraceContext({ role: 'reviewer', projectId: 'p1', taskId: 't1' }, async () => {
      const chunks: string[] = [];
      for await (const c of provider.chat([{ role: 'USER', content: 'hi' }], {
        model: 'reviewer',
        systemPrompt: 'sys',
      })) {
        chunks.push(c);
      }
      expect(chunks.length).toBeGreaterThan(0);
      expect(getCurrentTraceId()).toBeTruthy();
    });

    expect(starts).toHaveLength(1);
    expect(starts[0]?.name).toBe('chat');
    expect(starts[0]?.metadata).toMatchObject({
      role: 'reviewer',
      projectId: 'p1',
      taskId: 't1',
    });
    expect(ends).toHaveLength(1);
    expect(ends[0]?.level).toBeUndefined();
    expect(typeof ends[0]?.output).toBe('string');
  });

  it('records ERROR level when the underlying call throws', async () => {
    const ends: GenerationEnd[] = [];
    const tracer = recordingTracer([], ends);
    setTracerForTests(tracer);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'err' }),
    );
    const provider = createOpenAICompatibleProvider(
      { ...MOCK_CONFIG, apiKey: 'k' },
      { tracer },
    );
    await expect(provider.embed(['x'])).rejects.toThrow(/500/);
    expect(ends).toHaveLength(1);
    expect(ends[0]?.level).toBe('ERROR');
  });
});

describe('Langfuse HTTP ingest (enabled env)', () => {
  it('POSTs ingestion batches when chat completes', async () => {
    process.env.LANGFUSE_PUBLIC_KEY = 'pk';
    process.env.LANGFUSE_SECRET_KEY = 'sk';
    process.env.LANGFUSE_BASE_URL = 'http://lf.test';
    resetTracerForTests();

    const ingestCalls: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        if (String(url).includes('/api/public/ingestion')) {
          ingestCalls.push(JSON.parse(String(init?.body)));
          return { ok: true, status: 200 } as Response;
        }
        throw new Error(`unexpected fetch ${String(url)}`);
      }),
    );

    const provider = createOpenAICompatibleProvider(MOCK_CONFIG);
    await runWithTraceContext({ role: 'planner', projectId: 'proj' }, async () => {
      for await (const _ of provider.chat([{ role: 'USER', content: 'plan' }], {
        model: 'm',
        systemPrompt: 's',
      })) {
        /* drain */
      }
    });

    // Allow microtask enqueue to run
    await new Promise((r) => setTimeout(r, 0));
    expect(ingestCalls.length).toBeGreaterThanOrEqual(1);
    const first = ingestCalls[0] as { batch: Array<{ type: string }> };
    expect(first.batch.some((e) => e.type === 'trace-create')).toBe(true);
    expect(first.batch.some((e) => e.type === 'generation-create')).toBe(true);
  });
});

function recordingTracer(starts: GenerationStart[], ends: GenerationEnd[]): LlmTracer {
  return {
    enabled: true,
    startGeneration(start): GenerationHandle {
      starts.push(start);
      return {
        traceId: start.traceId ?? 'trace-test',
        end(result) {
          ends.push(result);
        },
      };
    },
    flush() {
      return Promise.resolve();
    },
  };
}
