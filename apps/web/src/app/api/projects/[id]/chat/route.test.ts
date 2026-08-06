import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for the SSE chat route handler.
 *
 * Every external dependency is mocked: auth, the project-schema resolver, the
 * chat persistence service, the system-prompt reader, and the model provider.
 * No real HTTP server, no DB, no provider round-trip. The tests drive `POST`
 * directly and drain the streamed `Response.body` to assert on the SSE frames.
 *
 * `streamOf` builds an `AsyncIterable<string>` from sync fixtures without an
 * `async function*` (which would trip `require-await` — there is nothing to
 * await when materialising canned chunks).
 */

const saveMessage = vi.fn();
const listMessages = vi.fn();
const readSystemPrompt = vi.fn();
const withRagContext = vi.fn((base: string, context: string) =>
  context ? `${base}\n\n${context}` : base,
);
const retrieveContext = vi.fn().mockResolvedValue('');
const requireUser = vi.fn();
const resolveProjectSchema = vi.fn();
const chatWithUsage = vi.fn();
const resolveAnalystProvider = vi.fn();

vi.mock('@/features/auth', () => ({ requireUser }));
vi.mock('@/features/chat/model/service', () => ({ listMessages, saveMessage }));
vi.mock('@/features/chat/model/schema', () => ({ readSystemPrompt, withRagContext }));
vi.mock('@/features/files/rag', () => ({ retrieveContext }));
vi.mock('@/features/projects', () => ({ resolveProjectSchema }));
vi.mock('@/features/model-config', () => ({ resolveAnalystProvider }));

const { POST } = await import('./route');

afterEach(() => {
  vi.clearAllMocks();
});

/** Build a POST request against the route with a JSON body. */
function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/projects/p1/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Build a fake provider stream: yields `values`, then rejects with `err` (if given). */
function streamOf(values: string[], err?: Error): AsyncIterable<string> {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        next(): Promise<IteratorResult<string>> {
          if (i < values.length) {
            return Promise.resolve({ value: values[i++], done: false });
          }
          if (err) return Promise.reject(err);
          return Promise.resolve({ value: undefined, done: true });
        },
      };
    },
  };
}

/** Fully drain the SSE response body into a single string. */
async function readStream(response: Response): Promise<string> {
  const body = response.body;
  if (!body) throw new Error('response has no body');
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
  }
  return raw;
}

/** Wire the happy-path mocks so a test only needs to assert on the response. */
function mockHappyPath(): void {
  requireUser.mockResolvedValue({ id: 'u1' });
  resolveProjectSchema.mockResolvedValue('project_x');
  listMessages.mockResolvedValue([]);
  readSystemPrompt.mockReturnValue('system prompt');
  resolveAnalystProvider.mockResolvedValue({
    provider: { chatWithUsage },
    chatConfig: { model: 'test-model', apiKey: 'test-key' },
    source: 'env',
  });
}

describe('POST /api/projects/[id]/chat — happy path', () => {
  it('streams the assistant reply and persists USER then ASSISTANT rows', async () => {
    mockHappyPath();
    chatWithUsage.mockResolvedValue({
      stream: streamOf(['Hello', ' ', 'world']),
      usage: Promise.resolve({ tokensIn: 5, tokensOut: 3 }),
    });

    const response = await POST(makeRequest({ message: 'hi' }), {
      params: Promise.resolve({ id: 'p1' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');

    const raw = await readStream(response);
    expect(raw).toContain('data: {"content":"Hello"}');
    expect(raw).toContain('data: {"content":" "}');
    expect(raw).toContain('data: {"content":"world"}');
    expect(raw).toContain('data: "[DONE]"');

    expect(saveMessage).toHaveBeenCalledTimes(2);
    expect(saveMessage).toHaveBeenNthCalledWith(1, 'project_x', {
      role: 'USER',
      content: 'hi',
    });
    expect(saveMessage).toHaveBeenNthCalledWith(2, 'project_x', {
      role: 'ASSISTANT',
      content: 'Hello world',
      tokensIn: 5,
      tokensOut: 3,
    });
  });
});

describe('POST /api/projects/[id]/chat — validation', () => {
  it('answers 400 on an empty message without persisting or streaming', async () => {
    mockHappyPath();

    const response = await POST(makeRequest({ message: '   ' }), {
      params: Promise.resolve({ id: 'p1' }),
    });

    expect(response.status).toBe(400);
    expect(saveMessage).not.toHaveBeenCalled();
    expect(chatWithUsage).not.toHaveBeenCalled();
  });
});

describe('POST /api/projects/[id]/chat — authorization', () => {
  it('answers 404 when the user cannot access the project', async () => {
    requireUser.mockResolvedValue({ id: 'u1' });
    resolveProjectSchema.mockResolvedValue(null);

    const response = await POST(makeRequest({ message: 'hi' }), {
      params: Promise.resolve({ id: 'p1' }),
    });

    expect(response.status).toBe(404);
    expect(saveMessage).not.toHaveBeenCalled();
    expect(chatWithUsage).not.toHaveBeenCalled();
  });
});

describe('POST /api/projects/[id]/chat — provider failure', () => {
  it('emits an error frame and skips the ASSISTANT save when the stream throws', async () => {
    mockHappyPath();
    chatWithUsage.mockResolvedValue({
      stream: streamOf(['partial'], new Error('boom')),
      usage: Promise.resolve({ tokensIn: null, tokensOut: null }),
    });

    const response = await POST(makeRequest({ message: 'hi' }), {
      params: Promise.resolve({ id: 'p1' }),
    });

    expect(response.status).toBe(200);

    const raw = await readStream(response);
    expect(raw).toContain('event: error');
    expect(raw).toContain('data: {"message":"boom"}');

    // USER row was persisted before the stream opened; ASSISTANT row never is —
    // exactly one call, and it is the USER turn.
    expect(saveMessage).toHaveBeenCalledTimes(1);
    expect(saveMessage).toHaveBeenCalledWith('project_x', {
      role: 'USER',
      content: 'hi',
    });
  });
});
