import { afterEach, describe, expect, it, vi } from 'vitest';

import { createOpenAICompatibleProvider } from './openai-compatible';
import { MOCK_EMBEDDING_DIM } from './mock-embeddings';
import type { ProviderConfig } from './types';

/**
 * Tests for the OpenAI-compatible provider. Covers the new `embed` contract in
 * both MOCK (no key) and LIVE (fetch stubbed) modes, and pins the
 * acceptance-shape requirement: every embedding vector must be length 768
 * (text-embedding-3-small) so downstream pgvector writes/tests shape-match.
 *
 * Chat streaming is already covered exhaustively in env-provider.test.ts (the
 * z.ai factory delegates to this provider); here we only assert the new surface.
 */

const EMBED_DIM = 768;

/** A mock-mode config: no apiKey ⇒ canned replies + deterministic vectors. */
const MOCK_CONFIG: ProviderConfig = {
  baseURL: 'https://example.test/v1',
  chatModel: 'glm-4.6',
  embeddingModel: 'text-embedding-3-small',
};

/** A live-mode config: apiKey present ⇒ real HTTP paths (fetch stubbed). */
function liveConfig(): ProviderConfig {
  return { ...MOCK_CONFIG, apiKey: 'test-key' };
}

/** Build a JSON Response carrying an OpenAI-style embeddings payload. */
function embeddingsResponse(vectors: number[][]): Response {
  const payload: unknown = { data: vectors.map((embedding) => ({ embedding })) };
  return { ok: true, status: 200, json: () => Promise.resolve(payload) } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createOpenAICompatibleProvider.embed (mock path, no key)', () => {
  it('returns one vector per input, each length 768', async () => {
    const provider = createOpenAICompatibleProvider(MOCK_CONFIG);
    const vectors = await provider.embed(['hi']);
    expect(vectors).toHaveLength(1);
    expect(vectors[0]).toHaveLength(EMBED_DIM);
    expect(MOCK_EMBEDDING_DIM).toBe(EMBED_DIM);
  });

  it('is deterministic: same input yields the same vector', async () => {
    const provider = createOpenAICompatibleProvider(MOCK_CONFIG);
    const a = await provider.embed(['hello world']);
    const b = await provider.embed(['hello world']);
    expect(a).toEqual(b);
  });

  it('preserves input order and count for multiple texts', async () => {
    const provider = createOpenAICompatibleProvider(MOCK_CONFIG);
    const vectors = await provider.embed(['one', 'two', 'three']);
    expect(vectors).toHaveLength(3);
    for (const v of vectors) expect(v).toHaveLength(EMBED_DIM);
  });
});

describe('createOpenAICompatibleProvider.embed (live path, mocked fetch)', () => {
  it('POSTs /embeddings and returns the parsed data[].embedding in order', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        embeddingsResponse([
          Array.from({ length: EMBED_DIM }, (_, i) => i),
          Array.from({ length: EMBED_DIM }, (_, i) => i + 1),
        ]),
      );
    vi.stubGlobal('fetch', fetchMock);

    const provider = createOpenAICompatibleProvider(liveConfig());
    const vectors = await provider.embed(['a', 'b']);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://example.test/v1/embeddings');
    const body = JSON.parse((init as RequestInit).body as string) as {
      model: string;
      input: string[];
    };
    expect(body.model).toBe('text-embedding-3-small');
    expect(body.input).toEqual(['a', 'b']);
    expect(vectors).toHaveLength(2);
    expect(vectors[0]).toHaveLength(EMBED_DIM);
  });

  it('throws on a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' }),
    );
    const provider = createOpenAICompatibleProvider(liveConfig());
    await expect(provider.embed(['x'])).rejects.toThrow(/401/);
  });
});

describe('createOpenAICompatibleProvider.chatWithTools (live path, tool deltas)', () => {
  it('maps text + tool_call deltas and tool_calls_done finish into events', async () => {
    const chunks = [
      // First a text delta.
      { choices: [{ delta: { content: 'Planni' } }] },
      { choices: [{ delta: { content: 'ng…' } }] },
      // Then a tool-call: first delta carries id+name, second appends args.
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: 'tc1', function: { name: 'spec:generate', arguments: '{}' } },
              ],
            },
          },
        ],
      },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '' } }] } }] },
      // Terminal finish_reason.
      {
        choices: [{ finish_reason: 'tool_calls' }],
        usage: { prompt_tokens: 3, completion_tokens: 1 },
      },
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse(chunks)));

    const provider = createOpenAICompatibleProvider(liveConfig());
    const { stream, usage } = await provider.chatWithTools(
      [{ role: 'USER', content: 'сделай спеку' }],
      {
        model: 'm',
        systemPrompt: '',
        tools: [{ type: 'function', function: { name: 'spec:generate' } }],
      },
    );

    const events: { type: string; text?: string; name?: string; args?: string }[] = [];
    for await (const evt of stream) {
      if (evt.type === 'text') events.push({ type: 'text', text: evt.text });
      else if (evt.type === 'tool_call_delta')
        events.push({ type: 'tool_call_delta', name: evt.delta.name, args: evt.delta.arguments });
      else events.push({ type: evt.type });
    }
    const u = await usage;

    expect(events).toEqual([
      { type: 'text', text: 'Planni' },
      { type: 'text', text: 'ng…' },
      { type: 'tool_call_delta', name: 'spec:generate', args: '{}' },
      { type: 'tool_call_delta', name: undefined, args: '' },
      { type: 'tool_calls_done' },
    ]);
    expect(u).toEqual({ tokensIn: 3, tokensOut: 1 });
  });
});

/** Build a fake SSE Response body from a list of JSON chunks. */
function sseResponse(chunks: unknown[]): Response {
  const body = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n';
  const encoder = new TextEncoder();
  return {
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(body));
        controller.close();
      },
    }),
  } as Response;
}

describe('createOpenAICompatibleProvider chat surface', () => {
  it('exposes chat, chatWithUsage, and embed', () => {
    const provider = createOpenAICompatibleProvider(MOCK_CONFIG);
    expect(typeof provider.chat).toBe('function');
    expect(typeof provider.chatWithUsage).toBe('function');
    expect(typeof provider.chatWithTools).toBe('function');
    expect(typeof provider.embed).toBe('function');
  });
});
