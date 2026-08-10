import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LiveChatEvent } from '@aiflow/ai-roles';

/**
 * Unit tests for the AG-UI thread run route (`POST /threads/{tid}/run`), tool-aware.
 *
 * Every external dependency is mocked: auth, schema resolve, thread backfill,
 * chat persistence, system-prompt reader, RAG, the model provider
 * (`chatWithTools`), and the tool executors. Tests drive `POST` directly and
 * drain the streamed body to assert on the AG-UI event frames.
 *
 * `@/features/chat` and `@/features/specifications` are mocked as wholes
 * (see threads/route.test.ts for the alias rationale).
 */

const {
  requireUser,
  resolveProjectSchema,
  ensureThreadSchema,
  listMessagesByThread,
  saveMessage,
  readSystemPrompt,
  withRagContext,
  retrieveContext,
  chatWithTools,
  resolveAnalystProvider,
  generateSpecification,
  listTasks,
  getTaskDetail,
} = vi.hoisted(() => ({
  requireUser: vi.fn(),
  resolveProjectSchema: vi.fn(),
  ensureThreadSchema: vi.fn().mockResolvedValue(undefined),
  listMessagesByThread: vi.fn(),
  saveMessage: vi.fn(),
  readSystemPrompt: vi.fn(),
  withRagContext: vi.fn((base: string, ctx: string) => (ctx ? `${base}\n\n${ctx}` : base)),
  retrieveContext: vi.fn().mockResolvedValue(''),
  chatWithTools: vi.fn(),
  resolveAnalystProvider: vi.fn(),
  generateSpecification: vi.fn(),
  listTasks: vi.fn(),
  getTaskDetail: vi.fn(),
}));

vi.mock('@/features/auth', () => ({ requireUser }));
vi.mock('@/features/projects', () => ({ resolveProjectSchema }));
vi.mock('@aiflow/db', () => ({ ensureThreadSchema }));
vi.mock('@/features/chat', () => ({
  listMessagesByThread,
  saveMessage,
  readSystemPrompt,
  withRagContext,
  listMessages: vi.fn(),
  readSpecTemplate: vi.fn(),
}));
vi.mock('@/features/files/rag', () => ({ retrieveContext }));
vi.mock('@/features/model-config', () => ({ resolveAnalystProvider }));
vi.mock('@/features/specifications', () => ({ generateSpecification }));
vi.mock('@/features/tasks', () => ({
  listTasks,
  getTaskDetail,
  enqueuePlan: vi.fn(),
  enqueueExecute: vi.fn(),
  resolveCodeContext: vi.fn(),
  PlanSpecRequiredError: class PlanSpecRequiredError extends Error {
    constructor() {
      super('spec required');
      this.name = 'PlanSpecRequiredError';
    }
  },
}));
vi.mock('@/features/deploy', () => ({
  createDeployment: vi.fn(),
  resolveDeployContext: vi.fn(),
}));
vi.mock('@/features/editor', () => ({
  listTree: vi.fn(),
  getFileContent: vi.fn(),
  resolveEditorContext: vi.fn(),
  isBinaryFileError: () => false,
  isNotFoundError: () => false,
}));

const { POST } = await import('./route');

afterEach(() => {
  vi.clearAllMocks();
});

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/projects/p1/threads/t1/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Build an `AsyncIterable<LiveChatEvent>` from a sync list, rejecting with err at end if given. */
function eventStreamOf(events: LiveChatEvent[], err?: Error): AsyncIterable<LiveChatEvent> {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        next(): Promise<IteratorResult<LiveChatEvent>> {
          if (i < events.length) return Promise.resolve({ value: events[i++], done: false });
          if (err) return Promise.reject(err);
          return Promise.resolve({ value: undefined as unknown as LiveChatEvent, done: true });
        },
      };
    },
  };
}

async function readStream(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('no body');
  const decoder = new TextDecoder();
  let raw = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
  }
  return raw;
}

function mockResolve(): void {
  requireUser.mockResolvedValue({ id: 'u1', uiMode: 'PRO' });
  resolveProjectSchema.mockResolvedValue('project_x');
  listMessagesByThread.mockResolvedValue([]);
  readSystemPrompt.mockReturnValue('system prompt');
  resolveAnalystProvider.mockResolvedValue({
    provider: { chatWithTools },
    chatConfig: { model: 'test-model', apiKey: 'test-key' },
    source: 'env',
  });
}

function ctx() {
  return { params: Promise.resolve({ id: 'p1', tid: 't1' }) };
}

describe('POST /threads/{tid}/run — text-only path', () => {
  it('emits RUN_STARTED → TEXT_MESSAGE_* → RUN_FINISHED and persists both rows', async () => {
    mockResolve();
    chatWithTools.mockResolvedValue({
      stream: eventStreamOf([
        { type: 'text', text: 'Hello' },
        { type: 'text', text: ' world' },
      ]),
      usage: Promise.resolve({ tokensIn: 5, tokensOut: 2 }),
    });

    const response = await POST(
      makeRequest({ threadId: 't1', messages: [{ id: 'm0', role: 'user', content: 'hi' }] }),
      ctx(),
    );

    expect(response.status).toBe(200);
    const raw = await readStream(response);
    expect(raw).toContain('"type":"RUN_STARTED"');
    expect(raw).toContain('"delta":"Hello"');
    expect(raw).toContain('"delta":" world"');
    expect(raw).toContain('"type":"RUN_FINISHED"');

    expect(saveMessage).toHaveBeenCalledTimes(2);
    expect(saveMessage).toHaveBeenNthCalledWith(1, 'project_x', {
      role: 'USER',
      content: 'hi',
      threadId: 't1',
    });
    expect(saveMessage).toHaveBeenNthCalledWith(2, 'project_x', {
      role: 'ASSISTANT',
      content: 'Hello world',
      threadId: 't1',
      tokensIn: 5,
      tokensOut: 2,
    });
  });
});

describe('POST /threads/{tid}/run — tool-call path (spec:generate)', () => {
  it('emits TOOL_CALL_START/ARGS/END/RESULT when the model calls spec:generate', async () => {
    mockResolve();
    chatWithTools
      .mockResolvedValueOnce({
        stream: eventStreamOf([
          {
            type: 'tool_call_delta',
            delta: { index: 0, id: 'tc1', name: 'spec:generate', arguments: '{}' },
          },
          { type: 'tool_calls_done' },
        ]),
        usage: Promise.resolve({ tokensIn: 1, tokensOut: 0 }),
      })
      .mockResolvedValueOnce({
        stream: eventStreamOf([{ type: 'text', text: 'Спецификация готова.' }]),
        usage: Promise.resolve({ tokensIn: 2, tokensOut: 1 }),
      });
    generateSpecification.mockResolvedValue({
      id: 'spec1',
      version: 1,
      content: '# SPEC',
      createdAt: new Date('2026-01-01'),
    });

    const response = await POST(
      makeRequest({
        threadId: 't1',
        messages: [{ id: 'm0', role: 'user', content: 'сделай спецификацию' }],
      }),
      ctx(),
    );

    expect(response.status).toBe(200);
    const raw = await readStream(response);
    expect(raw).toContain('"type":"TOOL_CALL_START"');
    expect(raw).toContain('"toolCallName":"spec:generate"');
    expect(raw).toContain('"type":"TOOL_CALL_ARGS"');
    expect(raw).toContain('"type":"TOOL_CALL_END"');
    expect(raw).toContain('"type":"TOOL_CALL_RESULT"');
    expect(raw).toContain('"delta":"Спецификация готова."');
    expect(raw).toContain('"type":"RUN_FINISHED"');
    expect(chatWithTools).toHaveBeenCalledTimes(2);
    // USER + final assistant text.
    expect(saveMessage).toHaveBeenCalledTimes(2);
  });
});

describe('POST /threads/{tid}/run — multi-turn chaining', () => {
  it('chains tool → result → another tool → final text', async () => {
    mockResolve();
    stubTaskReads();
    mockThreeToolTurns();

    const response = await POST(
      makeRequest({
        threadId: 't1',
        messages: [{ id: 'm0', role: 'user', content: 'покажи задачи и статус' }],
      }),
      ctx(),
    );
    const raw = await readStream(response);
    expect(raw).toContain('"toolCallName":"list_tasks"');
    expect(raw).toContain('"toolCallName":"task_status"');
    expect(raw).toContain('"delta":"Одна задача в PENDING."');
    expect(chatWithTools).toHaveBeenCalledTimes(3);
    const secondHistory = chatWithTools.mock.calls[1][0] as Array<{ role: string }>;
    expect(secondHistory.some((m) => m.role === 'TOOL')).toBe(true);
  });
});

describe('POST /threads/{tid}/run — multi-turn iteration guard', () => {
  it('stops after MAX_TOOL_ITERS when the model keeps calling tools', async () => {
    mockResolve();
    listTasks.mockResolvedValue([]);
    chatWithTools.mockResolvedValue({
      stream: eventStreamOf([
        {
          type: 'tool_call_delta',
          delta: { index: 0, id: 'tc', name: 'list_tasks', arguments: '{}' },
        },
        { type: 'tool_calls_done' },
      ]),
      usage: Promise.resolve({ tokensIn: 1, tokensOut: 0 }),
    });

    const response = await POST(
      makeRequest({
        threadId: 't1',
        messages: [{ id: 'm0', role: 'user', content: 'loop' }],
      }),
      ctx(),
    );
    const raw = await readStream(response);
    expect(raw).toContain('"type":"RUN_FINISHED"');
    expect(chatWithTools).toHaveBeenCalledTimes(5);
  });
});

function stubTaskReads(): void {
  listTasks.mockResolvedValue([{ id: 't1', title: 'A', status: 'PENDING' }]);
  getTaskDetail.mockResolvedValue({
    id: 't1',
    title: 'A',
    status: 'PENDING',
    logs: [],
  });
}

function mockThreeToolTurns(): void {
  chatWithTools
    .mockResolvedValueOnce({
      stream: eventStreamOf([
        {
          type: 'tool_call_delta',
          delta: { index: 0, id: 'tc1', name: 'list_tasks', arguments: '{}' },
        },
        { type: 'tool_calls_done' },
      ]),
      usage: Promise.resolve({ tokensIn: 1, tokensOut: 0 }),
    })
    .mockResolvedValueOnce({
      stream: eventStreamOf([
        {
          type: 'tool_call_delta',
          delta: { index: 0, id: 'tc2', name: 'task_status', arguments: '{"taskId":"t1"}' },
        },
        { type: 'tool_calls_done' },
      ]),
      usage: Promise.resolve({ tokensIn: 2, tokensOut: 0 }),
    })
    .mockResolvedValueOnce({
      stream: eventStreamOf([{ type: 'text', text: 'Одна задача в PENDING.' }]),
      usage: Promise.resolve({ tokensIn: 3, tokensOut: 2 }),
    });
}

describe('POST /threads/{tid}/run — validation & auth', () => {
  it('answers 400 on empty message', async () => {
    mockResolve();
    const response = await POST(
      makeRequest({ threadId: 't1', messages: [{ id: 'm0', role: 'user', content: '   ' }] }),
      ctx(),
    );
    expect(response.status).toBe(400);
    expect(chatWithTools).not.toHaveBeenCalled();
  });

  it('answers 404 when the project is inaccessible', async () => {
    requireUser.mockResolvedValue({ id: 'u1' });
    resolveProjectSchema.mockResolvedValue(null);
    const response = await POST(
      makeRequest({ threadId: 't1', messages: [{ id: 'm0', role: 'user', content: 'hi' }] }),
      ctx(),
    );
    expect(response.status).toBe(404);
  });
});

describe('POST /threads/{tid}/run — provider failure', () => {
  it('emits RUN_ERROR when the stream throws', async () => {
    mockResolve();
    chatWithTools.mockResolvedValue({
      stream: eventStreamOf([{ type: 'text', text: 'partial' }], new Error('boom')),
      usage: Promise.resolve({ tokensIn: null, tokensOut: null }),
    });

    const response = await POST(
      makeRequest({ threadId: 't1', messages: [{ id: 'm0', role: 'user', content: 'hi' }] }),
      ctx(),
    );
    const raw = await readStream(response);
    expect(raw).toContain('"type":"RUN_ERROR"');
    expect(raw).toContain('"message":"boom"');
    // USER saved before the stream; no ASSISTANT.
    expect(saveMessage).toHaveBeenCalledTimes(1);
  });
});
