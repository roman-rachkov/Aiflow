/**
 * Unit tests for `streamSupportAnswer` (service.ts).
 *
 * `retrieveChunks` is injected as a dep — no cross-slice mock boundary.
 * Mocks `createProviderFromEnv` / `readProviderConfigFromEnv` to isolate the
 * orchestration: context injection, source deduplication, RAG degradation.
 */
import { describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@aiflow/ai-roles', () => ({
  createProviderFromEnv: vi.fn(),
  readProviderConfigFromEnv: vi.fn(() => ({ chatModel: 'test-model' })),
}));

const { createProviderFromEnv, readProviderConfigFromEnv } = await import('@aiflow/ai-roles');
const { streamSupportAnswer } = await import('./service');

type RetrieveChunksFn = (
  schema: string,
  query: string,
  k?: number,
) => Promise<{ id: string; content: string; distance: number; path: string }[]>;

type ChatCall = [{ role: string; content: string }[], unknown];

function makeMockProvider(chunks: string[]) {
  return {
    // eslint-disable-next-line @typescript-eslint/require-await -- mock generator
    chat: vi.fn(async function* () {
      for (const c of chunks) yield c;
    }),
    embed: vi.fn(),
    chatWithUsage: vi.fn(),
    chatWithTools: vi.fn(),
  };
}

function makeRetrieve(
  items: { id: string; content: string; distance: number; path: string }[],
): Mock<RetrieveChunksFn> {
  return vi.fn().mockResolvedValue(items);
}

describe('streamSupportAnswer — output', () => {
  it('streams text chunks and returns deduplicated sources', async () => {
    (readProviderConfigFromEnv as Mock).mockReturnValue({ chatModel: 'glm-4.6' });
    const mockProvider = makeMockProvider(['Hello', ' world']);
    (createProviderFromEnv as Mock).mockReturnValue(mockProvider);
    const retrieve = makeRetrieve([
      { id: '1', content: 'doc content', distance: 0.1, path: 'SPEC.md' },
      { id: '2', content: 'more content', distance: 0.2, path: 'SPEC.md' },
      { id: '3', content: 'other content', distance: 0.3, path: 'README.md' },
    ]);

    const { stream, sources } = await streamSupportAnswer('project_abc', 'What is this app?', {
      retrieveChunks: retrieve,
    });

    expect(sources).toEqual(['SPEC.md', 'README.md']);
    const collected: string[] = [];
    for await (const chunk of stream) collected.push(chunk);
    expect(collected).toEqual(['Hello', ' world']);
    expect(mockProvider.chat).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ role: 'SYSTEM' }),
        expect.objectContaining({ role: 'USER', content: 'What is this app?' }),
      ]),
      expect.objectContaining({ model: 'glm-4.6' }),
    );
  });

  it('degrades to chat-without-RAG when retrieveChunks throws', async () => {
    (readProviderConfigFromEnv as Mock).mockReturnValue({ chatModel: 'glm-4.6' });
    (createProviderFromEnv as Mock).mockReturnValue(makeMockProvider(['Fallback answer']));
    const retrieve: Mock<RetrieveChunksFn> = vi
      .fn()
      .mockRejectedValue(new Error('pgvector offline'));

    const { stream, sources } = await streamSupportAnswer('project_abc', 'Help?', {
      retrieveChunks: retrieve,
    });

    expect(sources).toEqual([]);
    const collected: string[] = [];
    for await (const chunk of stream) collected.push(chunk);
    expect(collected).toEqual(['Fallback answer']);
  });
});

describe('streamSupportAnswer — system prompt', () => {
  it('includes context in SYSTEM message when chunks are retrieved', async () => {
    (readProviderConfigFromEnv as Mock).mockReturnValue({ chatModel: 'glm-4.6' });
    const mockProvider = makeMockProvider(['OK']);
    (createProviderFromEnv as Mock).mockReturnValue(mockProvider);
    const retrieve = makeRetrieve([
      { id: '1', content: 'The app is a todo list', distance: 0.05, path: 'SPEC.md' },
    ]);

    await streamSupportAnswer('project_x', 'What does the app do?', { retrieveChunks: retrieve });

    const callArgs = (mockProvider.chat as Mock).mock.calls[0] as ChatCall;
    const systemMsg = callArgs[0].find((m) => m.role === 'SYSTEM');
    expect(systemMsg?.content).toContain('The app is a todo list');
    expect(systemMsg?.content).toContain('SPEC.md');
  });

  it('uses base prompt without context section when no chunks retrieved', async () => {
    (readProviderConfigFromEnv as Mock).mockReturnValue({ chatModel: 'glm-4.6' });
    const mockProvider = makeMockProvider(['I do not know']);
    (createProviderFromEnv as Mock).mockReturnValue(mockProvider);
    const retrieve = makeRetrieve([]);

    await streamSupportAnswer('project_x', 'Tell me something', { retrieveChunks: retrieve });

    const callArgs = (mockProvider.chat as Mock).mock.calls[0] as ChatCall;
    const systemMsg = callArgs[0].find((m) => m.role === 'SYSTEM');
    expect(systemMsg?.content).toContain('Support Bot');
    expect(systemMsg?.content).not.toContain('Context from project documents');
  });
});
