import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';

import { handleEscalate } from './escalate';

type MockRes = Response & { _sent: unknown[]; _headers: Record<string, string> };

function makeRes(): MockRes {
  const sent: unknown[] = [];
  const headers: Record<string, string> = {};
  const res = {
    statusCode: 200,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      sent.push(body);
      return res;
    },
    setHeader(k: string, v: string) {
      headers[k] = v;
    },
    _sent: sent,
    _headers: headers,
  } as unknown as MockRes;
  return res;
}

function makeReq(body: unknown): Request {
  return { body } as Request;
}

describe('handleEscalate', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns 400 when messages are missing', async () => {
    const res = makeRes();
    await handleEscalate(makeReq({ advisorModel: 'gpt-4' }), res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when advisorModel is missing', async () => {
    const res = makeRes();
    await handleEscalate(makeReq({ messages: [] }), res);
    expect(res.statusCode).toBe(400);
  });

  it('returns advisor response on success', async () => {
    const upstream = { choices: [{ message: { content: 'answer' } }] };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(upstream),
    });

    const res = makeRes();
    await handleEscalate(
      makeReq({ messages: [{ role: 'user', content: 'spec' }], advisorModel: 'gpt-4' }),
      res,
    );
    expect((res as unknown as { _sent: unknown[] })._sent[0]).toEqual(upstream);
  });

  it('returns 502 when upstream fetch throws', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network'));

    const res = makeRes();
    await handleEscalate(
      makeReq({ messages: [{ role: 'user', content: 'hi' }], advisorModel: 'gpt-4' }),
      res,
    );
    expect(res.statusCode).toBe(502);
  });

  it('returns 400 for invalid apiKey envelope', async () => {
    const res = makeRes();
    await handleEscalate(
      makeReq({ messages: [], advisorModel: 'gpt-4', apiKey: { __encrypted__: 42 } }),
      res,
    );
    expect(res.statusCode).toBe(400);
  });
});
