import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChatMessage } from '@aiflow/ai-roles';

/**
 * SPEC smoke test (task 17). Drives the specifications-slice half of the
 * primary path — `generateSpecification` (DI) → `listSpecifications` →
 * `getSpecificationByVersion` — end to end in mock mode. The per-service tests
 * already prove Prisma correctness; this one proves the WIRING between the
 * three steps against a shared fake client whose `specification.create` is
 * captured and replayed as the row the list/version reads return, exactly as
 * the route would observe after a real generation.
 *
 * `generateSpecification` takes a `GenerationDeps` bag (DI) so chat/files stay
 * out of this slice; here they are inline `vi.fn`s. The cross-slice files half
 * of the chain lives in `features/files/model/rag-smoke.test.ts` to keep each
 * test within its own slice (`boundaries/dependencies`).
 */

interface FakeClient {
  specification: {
    aggregate: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
}

const {
  specificationAggregate,
  specificationCreate,
  specificationFindMany,
  specificationFindFirst,
  fakeClient,
  chat,
} = vi.hoisted(() => {
  const specificationAggregate = vi.fn();
  const specificationCreate = vi.fn();
  const specificationFindMany = vi.fn();
  const specificationFindFirst = vi.fn();
  const chat = vi.fn();
  const fakeClient: FakeClient = {
    specification: {
      aggregate: specificationAggregate,
      create: specificationCreate,
      findMany: specificationFindMany,
      findFirst: specificationFindFirst,
    },
  };
  return {
    specificationAggregate,
    specificationCreate,
    specificationFindMany,
    specificationFindFirst,
    fakeClient,
    chat,
  };
});

vi.mock('@aiflow/db', () => ({
  getProjectClient: vi.fn(() => fakeClient),
}));

vi.mock('@aiflow/ai-roles', () => ({
  createZaiProvider: vi.fn(() => ({ chat })),
}));

const { generateSpecification, listSpecifications, getSpecificationByVersion } =
  await import('../index');

/** Yield chunks as an `AsyncIterable<string>`, like a provider stream. */
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

afterEach(() => {
  vi.clearAllMocks();
});

describe('SPEC smoke: generate -> list -> view', () => {
  it('runs the specifications-slice primary path end to end in mock mode', async () => {
    // 4. generateSpecification via DI. First-create so aggregate _max is null,
    // making the persisted version 1. The chat stream yields the SPEC body.
    specificationAggregate.mockResolvedValue({ _max: { version: null } });
    chat.mockReturnValue(streamOf(['# Project', ' body']));
    const createdRow = {
      id: 's1',
      version: 1,
      content: '# Project body',
      createdAt: new Date(),
      createdBy: 'AI' as const,
    };
    specificationCreate.mockResolvedValue(createdRow);

    const view = await generateSpecification('project_x', {
      listMessages: vi.fn().mockResolvedValue([{ role: 'USER', content: 'I want a notes app' }]),
      retrieveContext: vi
        .fn()
        .mockResolvedValue('Контекст из загруженных документов:\n\nSome notes text'),
      readSpecTemplate: vi.fn().mockReturnValue('# Project name\n## Goal and context'),
      createProvider: () => ({ chat }),
      config: { model: 'glm-4.6', apiKey: undefined, systemPrompt: '' },
    });
    expect(view.version).toBe(1);
    expect(view.createdBy).toBe('AI');
    expect(view.content).toContain('Project');
    // The persisted version is 1 (first create) and authored by the AI.
    expect(specificationCreate).toHaveBeenCalledWith({
      data: { version: 1, content: '# Project body', createdBy: 'AI' },
    });

    // 5. listSpecifications + getSpecificationByVersion return the created row.
    specificationFindMany.mockResolvedValue([createdRow]);
    specificationFindFirst.mockResolvedValue(createdRow);

    const list = await listSpecifications('project_x');
    expect(list[0].version).toBe(1);

    const one = await getSpecificationByVersion('project_x', 1);
    expect(one?.content).toContain('Project');

    // The chat stream was drained into the persisted content (wiring check).
    const [messages] = chat.mock.calls[0] as [ChatMessage[], unknown];
    expect(messages[0].role).toBe('USER');
  });
});
