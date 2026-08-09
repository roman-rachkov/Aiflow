import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for the AG-UI thread run route (`POST /threads/{tid}/run`).
 *
 * Every external dependency is mocked: auth, project-schema resolver, the
 * thread backfill, chat persistence, system-prompt reader, RAG, and the model
 * provider. Tests drive `POST` directly and drain the streamed body to assert
 * on the AG-UI event frames (RUN_STARTED / TEXT_MESSAGE_* / RUN_FINISHED).
 *
 * `@/features/chat` is mocked as a whole (see threads/route.test.ts for the
 * alias rationale).
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
  chatWithUsage,
  resolveAnalystProvider,
} = vi.hoisted(() => ({
  requireUser: vi.fn(),
  resolveProjectSchema: vi.fn(),
  ensureThreadSchema: vi.fn().mockResolvedValue(undefined),
  listMessagesByThread: vi.fn(),
  saveMessage: vi.fn(),
  readSystemPrompt: vi.fn(),
  withRagContext: vi.fn((base: string, ctx: string) => (ctx ? `${base}\n\n${ctx}` : base)),
  retrieveContext: vi.fn().mockResolvedValue(''),
  chatWithUsage: vi.fn(),
  resolveAnalystProvider: vi.fn(),
}));

vi.mock('@/features/auth', () => ({ requireUser }));
vi.mock('@/features/projects', () => ({ resolveProjectSchema }));
vi.mock('@aiflow/db', () => ({ ensureThreadSchema }));
vi.mock('@/features/chat', () => ({
  listMessagesByThread,
  saveMessage,
  readSystemPrompt,
  withRagContext,
}));
vi.mock('@/features/files/rag', () => ({ retrieveContext }));
vi.mock('@/features/model-config', () => ({ resolveAnalystProvider }));

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

/** Fake provider stream: yields `values`, then rejects with `err` if given. */
function streamOf(values: string[], err?: Error): AsyncIterable<string> {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        next(): Promise<IteratorResult<string>> {
          if (i < values.length) return Promise.resolve({ value: values[i++], done: false });
          if (err) return Promise.reject(err);
          return Promise.resolve({ value: undefined, done: true });
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

function mockHappyPath(): void {
  requireUser.mockResolvedValue({ id: 'u1' });
  resolveProjectSchema.mockResolvedValue('project_x');
  listMessagesByThread.mockResolvedValue([]);
  readSystemPrompt.mockReturnValue('system prompt');
  resolveAnalystProvider.mockResolvedValue({
    provider: { chatWithUsage },
    chatConfig: { model: 'test-model', apiKey: 'test-key' },
    source: 'env',
  });
}

describe('POST /threads/{tid}/run — AG-UI happy path', () => {
  it('emits RUN_STARTED → TEXT_MESSAGE_* → RUN_FINISHED and persists both rows', async () => {
    mockHappyPath();
    chatWithUsage.mockResolvedValue({
      stream: streamOf(['Hello', ' world']),
      usage: Promise.resolve({ tokensIn: 5, tokensOut: 2 }),
    });

    const response = await POST(
      makeRequest({ threadId: 't1', messages: [{ id: 'm0', role: 'user', content: 'hi' }] }),
      { params: Promise.resolve({ id: 'p1', tid: 't1' }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');

    const raw = await readStream(response);
    expect(raw).toContain('"type":"RUN_STARTED"');
    expect(raw).toContain('"type":"TEXT_MESSAGE_START"');
    expect(raw).toContain('"delta":"Hello"');
    expect(raw).toContain('"delta":" world"');
    expect(raw).toContain('"type":"TEXT_MESSAGE_END"');
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

describe('POST /threads/{tid}/run — validation', () => {
  it('answers 400 when the last message has no text', async () => {
    mockHappyPath();

    const response = await POST(
      makeRequest({ threadId: 't1', messages: [{ id: 'm0', role: 'user', content: '   ' }] }),
      { params: Promise.resolve({ id: 'p1', tid: 't1' }) },
    );

    expect(response.status).toBe(400);
    expect(saveMessage).not.toHaveBeenCalled();
    expect(chatWithUsage).not.toHaveBeenCalled();
  });
});

describe('POST /threads/{tid}/run — authorization', () => {
  it('answers 404 when the project is inaccessible', async () => {
    requireUser.mockResolvedValue({ id: 'u1' });
    resolveProjectSchema.mockResolvedValue(null);

    const response = await POST(
      makeRequest({ threadId: 't1', messages: [{ id: 'm0', role: 'user', content: 'hi' }] }),
      { params: Promise.resolve({ id: 'p1', tid: 't1' }) },
    );

    expect(response.status).toBe(404);
    expect(saveMessage).not.toHaveBeenCalled();
  });
});

describe('POST /threads/{tid}/run — provider failure', () => {
  it('emits RUN_ERROR and skips the ASSISTANT save', async () => {
    mockHappyPath();
    chatWithUsage.mockResolvedValue({
      stream: streamOf(['partial'], new Error('boom')),
      usage: Promise.resolve({ tokensIn: null, tokensOut: null }),
    });

    const response = await POST(
      makeRequest({ threadId: 't1', messages: [{ id: 'm0', role: 'user', content: 'hi' }] }),
      { params: Promise.resolve({ id: 'p1', tid: 't1' }) },
    );

    expect(response.status).toBe(200);
    const raw = await readStream(response);
    expect(raw).toContain('"type":"RUN_ERROR"');
    expect(raw).toContain('"message":"boom"');

    // Only the USER row (saved before the stream opened).
    expect(saveMessage).toHaveBeenCalledTimes(1);
  });
});
