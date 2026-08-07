import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for SPEC.md generation. `generateSpecification` uses dependency
 * injection (GenerationDeps) so chat/files functions are passed via the deps
 * bag — no `vi.mock` for those slices. Only `./service`'s `createSpecificationVersion`
 * is mocked (via `@aiflow/db`), to capture the persisted content and resolve a
 * fake view. Mirrors the harness style of features/chat & features/files tests.
 */
import type { ChatConfig, ChatMessage } from '@aiflow/ai-roles';

const create = vi.fn();
const aggregate = vi.fn().mockResolvedValue({ _max: { version: null } });

const fakeClient = { specification: { create, aggregate } };

vi.mock('@aiflow/db', () => ({
  getProjectClient: vi.fn(() => fakeClient),
}));

const { generateSpecification } = await import('./generate');
import type { GenerationDeps } from './generate';

/** Yield an array of chunks as an `AsyncIterable<string>`, like a provider stream. */
function streamOf(chunks: string[]): AsyncIterable<string> {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        next(): Promise<IteratorResult<string>> {
          if (i >= chunks.length) {
            return Promise.resolve<IteratorResult<string>>({ value: undefined, done: true });
          }
          return Promise.resolve<IteratorResult<string>>({ value: chunks[i++], done: false });
        },
      };
    },
  };
}

const TEMPLATE = '# Project name\n## Goal and context\n...TEMPLATE...';

afterEach(() => {
  vi.clearAllMocks();
});

/** Build a deps bag; the chat mock records its config + messages for assertions. */
function makeDeps(overrides: Partial<GenerationDeps> = {}): {
  deps: GenerationDeps;
  chat: ReturnType<typeof vi.fn>;
} {
  const chat = vi.fn(() => streamOf(['Hello', ' ', 'world']));
  const createProvider = vi.fn(() => ({ chat }));
  const config: ChatConfig = { model: 'glm-4.6', apiKey: undefined, systemPrompt: '' };
  const deps: GenerationDeps = {
    listMessages: vi.fn().mockResolvedValue([
      { role: 'USER', content: 'I want a notes app' },
      { role: 'ASSISTANT', content: 'Tell me more' },
    ]),
    retrieveContext: vi
      .fn()
      .mockResolvedValue('Контекст из загруженных документов:\n\n[Фрагмент 1]\nNotes are great'),
    readSpecTemplate: vi.fn(() => TEMPLATE),
    createProvider,
    config,
    ...overrides,
  };
  return { deps, chat };
}

/** Resolve the USER message handed to the provider in its last call. */
function userContent(calls: ReturnType<typeof vi.fn>['mock']['calls']): string {
  const [messages] = calls[calls.length - 1] as [ChatMessage[], ChatConfig];
  return messages[0].content;
}

describe('generateSpecification — collectChat concatenation', () => {
  it('concatenates the provider stream and persists it as the full text', async () => {
    const { deps } = makeDeps();
    create.mockResolvedValue({
      id: 's9',
      version: 4,
      content: 'Hello world',
      createdAt: new Date(),
      createdBy: 'AI',
      approvedAt: null,
    });

    const view = await generateSpecification('project_x', deps);

    expect(view.content).toBe('Hello world');
    expect(create).toHaveBeenCalledWith({
      data: { version: 1, content: 'Hello world', createdBy: 'AI' },
    });
  });
});

describe('generateSpecification — prompt composition', () => {
  it('puts the SPEC template in the system prompt and the dialog + RAG in the USER message', async () => {
    const { deps, chat } = makeDeps();

    await generateSpecification('project_x', deps);

    expect(chat).toHaveBeenCalledTimes(1);
    const [messages, passedConfig] = chat.mock.calls[0] as [ChatMessage[], ChatConfig];
    // System prompt carries the template (the Planner's fixed headings).
    expect(passedConfig.systemPrompt).toContain('Goal and context');
    // The single USER turn carries both the dialog and the RAG context block.
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('USER');
    expect(messages[0].content).toContain('I want a notes app');
    expect(messages[0].content).toContain('Контекст из загруженных документов');
  });

  it('omits the RAG context block when retrieveContext returns empty', async () => {
    const { deps, chat } = makeDeps({
      retrieveContext: vi.fn().mockResolvedValue(''),
    });

    await generateSpecification('project_x', deps);

    const content = userContent(chat.mock.calls);
    expect(content).not.toContain('Контекст из загруженных документов');
    // The dialog is still the whole USER content.
    expect(content).toContain('I want a notes app');
  });

  it('does not call retrieveContext when there is no USER message', async () => {
    const retrieveContext = vi.fn().mockResolvedValue('Контекст из загруженных документов');
    const { deps } = makeDeps({
      listMessages: vi
        .fn()
        .mockResolvedValue([{ role: 'ASSISTANT', content: 'Only assistant turns' }]),
      retrieveContext,
    });

    await generateSpecification('project_x', deps);

    expect(retrieveContext).not.toHaveBeenCalled();
  });
});
