import { NextResponse } from 'next/server';

import { requireUser } from '@/features/auth';
import { resolveProjectSchema } from '@/features/projects';
import { retrieveChunks } from '@/features/files/rag';
import { streamSupportAnswer } from '@/features/support-bot';
import type { SupportChatRequest } from '@/features/support-bot';

/**
 * POST /api/projects/{id}/support/chat
 *
 * Streams a Support Bot answer as Server-Sent Events:
 *   data: {"text":"…"}                           — one text delta
 *   data: {"done":true,"sources":["SPEC.md",…]}  — terminal event
 *   data: [DONE]                                 — SSE end marker
 *
 * The bot uses pgvector RAG over the project's indexed documents, then calls
 * the project's configured AI provider. Auth is required; missing/foreign
 * projects are returned as 404.
 *
 * Cross-slice wiring: `retrieveChunks` is imported here (`app/` layer) and
 * injected into `streamSupportAnswer` to satisfy the `boundaries/dependencies`
 * rule that blocks feature→feature imports.
 */

/** Parse + validate the request body; return 400 on bad input. */
function parseBody(raw: unknown): SupportChatRequest | NextResponse {
  if (typeof raw !== 'object' || raw === null) {
    return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 });
  }
  const obj = raw as { message?: unknown };
  if (typeof obj.message !== 'string' || obj.message.trim().length === 0) {
    return NextResponse.json({ error: 'Введите сообщение' }, { status: 400 });
  }
  return { message: obj.message.trim() };
}

/** Encode one SSE frame. */
function sseFrame(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

/** Encode the SSE [DONE] terminator. */
function sseDone(): Uint8Array {
  return new TextEncoder().encode('data: [DONE]\n\n');
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const schemaName = await resolveProjectSchema(id, user.id);
  if (!schemaName) {
    return NextResponse.json({ error: 'Проект не найден' }, { status: 404 });
  }

  const body = parseBody(await request.json().catch(() => null));
  if (body instanceof NextResponse) return body;

  let result: Awaited<ReturnType<typeof streamSupportAnswer>>;
  try {
    result = await streamSupportAnswer(schemaName, body.message, { retrieveChunks });
  } catch {
    return NextResponse.json({ error: 'Ошибка сервиса бота' }, { status: 500 });
  }

  const { stream, sources } = result;

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          controller.enqueue(sseFrame({ text: chunk }));
        }
        controller.enqueue(sseFrame({ done: true, sources }));
        controller.enqueue(sseDone());
      } catch {
        controller.enqueue(sseFrame({ error: 'Stream error' }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
