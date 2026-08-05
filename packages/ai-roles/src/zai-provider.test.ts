import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChatConfig, ChatMessage } from './types';
import { ZaiProvider } from './zai-provider';

/**
 * Tests for ZaiProvider. Two paths are covered:
 *  - MOCK: `ZAI_API_KEY` unset. Canned Russian reply, null usage.
 *  - LIVE: `globalThis.fetch` stubbed to return a ReadableStream of SSE frames.
 *
 * The live tests never hit the network: every fetch call is a `vi.fn` that
 * returns a hand-built Response. Env is controlled by deleting/restoring
 * `ZAI_API_KEY` around each test so the constructor reads what we expect.
 */

const BASE_CONFIG: ChatConfig = {
  model: 'glm-4-flash',
  systemPrompt: 'You are a helpful analyst.',
};

const USER_MSG: ChatMessage = { role: 'USER', content: 'Describe the app' };

/** Build a ReadableStream of SSE bytes from an array of `data:` payloads. */
function makeSseBody(dataLines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const frames = dataLines.map((line) => `data: ${line}\n\n`).join('');
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(frames));
      controller.close();
    },
  });
}

/** Minimal Response-shape that streamLiveChat consumes (`ok`, `status`, `body`). */
function sseResponse(body: ReadableStream<Uint8Array>): Response {
  return { ok: true, status: 200, body } as Response;
}

/** JSON for a content-delta frame. */
function delta(content: string): string {
  return JSON.stringify({ choices: [{ delta: { content } }] });
}

/** JSON for the terminal usage frame (empty delta + token counts). */
function usageFrame(promptTokens: number, completionTokens: number): string {
  return JSON.stringify({
    choices: [{ delta: {} }],
    usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
  });
}

/** Stub globalThis.fetch to resolve with the given Response-like object. */
function stubFetch(response: Response): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
}

/** Drain an async iterable into an array; used to fully consume a stream. */
async function drain(stream: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const c of stream) out.push(c);
  return out;
}

/** Construct a live provider: env key set so the constructor picks live mode. */
function liveProvider(): ZaiProvider {
  process.env.ZAI_API_KEY = 'test-key';
  return new ZaiProvider();
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ZAI_API_KEY;
});

describe('ZaiProvider mock path (no ZAI_API_KEY)', () => {
  it('yields multiple non-empty chunks', async () => {
    const provider = new ZaiProvider();
    const chunks = await drain(provider.chat([USER_MSG], BASE_CONFIG));
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeGreaterThan(0);
  });

  it('usage resolves to nulls once the stream drains', async () => {
    const provider = new ZaiProvider();
    const { stream, usage } = await provider.chatWithUsage([USER_MSG], BASE_CONFIG);
    await drain(stream);
    await expect(usage).resolves.toEqual({ tokensIn: null, tokensOut: null });
  });

  it('accepts a systemPrompt in config and all three roles in messages', async () => {
    const provider = new ZaiProvider();
    const messages: ChatMessage[] = [
      { role: 'SYSTEM', content: 'sys' },
      { role: 'USER', content: 'u' },
      { role: 'ASSISTANT', content: 'a' },
      { role: 'USER', content: 'follow up' },
    ];
    const chunks = await drain(provider.chat(messages, { ...BASE_CONFIG, systemPrompt: 'p' }));
    expect(chunks.length).toBeGreaterThan(0);
  });
});

describe('ZaiProvider live path (mocked fetch)', () => {
  it('yields concatenated content in order and resolves usage', async () => {
    const body = makeSseBody([delta('Hello'), delta(' world'), usageFrame(12, 34), '[DONE]']);
    stubFetch(sseResponse(body));
    const provider = liveProvider();

    const { stream, usage } = await provider.chatWithUsage([USER_MSG], BASE_CONFIG);
    const chunks = await drain(stream);

    expect(chunks.join('')).toBe('Hello world');
    await expect(usage).resolves.toEqual({ tokensIn: 12, tokensOut: 34 });
  });

  it('throws on a 4xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        body: null,
      }),
    );
    const provider = liveProvider();
    await expect(drain(provider.chat([USER_MSG], BASE_CONFIG))).rejects.toThrow(/429/);
  });

  it('usage resolves to nulls when the stream carries no usage block', async () => {
    const body = makeSseBody([delta('Hi'), delta(' there'), '[DONE]']);
    stubFetch(sseResponse(body));
    const provider = liveProvider();

    const { stream, usage } = await provider.chatWithUsage([USER_MSG], BASE_CONFIG);
    await drain(stream);
    await expect(usage).resolves.toEqual({ tokensIn: null, tokensOut: null });
  });
});
