import { NextResponse } from 'next/server';

import { createZaiProvider } from '@aiflow/ai-roles';
import type { ChatConfig, ChatMessage } from '@aiflow/ai-roles';
import { getPublicClient } from '@aiflow/db';

import { canAccessProject, requireUser } from '@/features/auth';
import { listMessages, saveMessage } from '@/features/chat/model/service';
import { readSystemPrompt } from '@/features/chat/model/schema';

/**
 * Streaming chat turn against the Analyst agent.
 *
 * Auth and validation run before the response body is committed: a missing or
 * foreign project answers 404 (no existence leak — the same answer for "not
 * yours" and "does not exist"), and an empty message answers 400. Once those
 * pass, the user's message is persisted immediately so a provider failure
 * never loses the question. The assistant reply is then streamed as SSE; the
 * ASSISTANT row is written only after the stream completes successfully, with
 * token counts read from the provider's usage side-channel.
 *
 * Deep imports into `features/chat/model/*` are intentional: the slice's barrel
 * is wired up in task 12, and `import/no-internal-modules` is scoped to `features`
 * modules so these `app/` paths are allowed. See the chat slice's `index.ts`.
 */

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
} as const;

const DEFAULT_MODEL = 'glm-4.6';

/** Encode one SSE frame as bytes. `event` is omitted for default data frames. */
function encodeSse(payload: unknown, event?: string): Uint8Array {
  const encoder = new TextEncoder();
  const body =
    event === undefined
      ? `data: ${JSON.stringify(payload)}\n\n`
      : `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  return encoder.encode(body);
}

/** Map the persisted view's role union onto the provider's ChatRole. */
function toProviderMessages(
  views: ReadonlyArray<{ role: 'USER' | 'ASSISTANT' | 'SYSTEM'; content: string }>,
): ChatMessage[] {
  return views.map((m) => ({ role: m.role, content: m.content }));
}

/** Resolve the model + key + system prompt for this turn from env and disk. */
function buildChatConfig(systemPrompt: string): ChatConfig {
  return {
    model: process.env.ZAI_MODEL ?? DEFAULT_MODEL,
    apiKey: process.env.ZAI_API_KEY,
    systemPrompt,
  };
}

/**
 * Resolve the project's schema for `id` after auth. `canAccessProject` is the
 * ownership gate; the follow-up `projectMeta` read is defense in depth — it
 * re-checks `deletedAt` and ownership and yields the `schemaName` the chat
 * service needs. Any miss returns `null`, which the caller maps to a 404.
 */
async function resolveProjectSchema(id: string, ownerId: string): Promise<string | null> {
  if (!(await canAccessProject(ownerId, id))) return null;

  const meta = await getPublicClient().projectMeta.findUnique({
    where: { id, deletedAt: null },
    select: { schemaName: true, ownerId: true },
  });
  if (!meta || meta.ownerId !== ownerId) return null;

  return meta.schemaName;
}

/** Run the provider stream, emitting SSE frames and persisting the assistant row. */
function streamAssistantReply(
  schemaName: string,
  history: ChatMessage[],
  config: ChatConfig,
): ReadableStream<Uint8Array> {
  const provider = createZaiProvider();

  return new ReadableStream({
    async start(controller) {
      let fullText = '';
      try {
        const { stream, usage } = await provider.chatWithUsage(history, config);
        for await (const chunk of stream) {
          fullText += chunk;
          controller.enqueue(encodeSse({ content: chunk }));
        }
        const { tokensIn, tokensOut } = await usage;
        await saveMessage(schemaName, {
          role: 'ASSISTANT',
          content: fullText,
          tokensIn,
          tokensOut,
        });
        controller.enqueue(encodeSse('[DONE]'));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Ошибка стриминга';
        controller.enqueue(encodeSse({ message }, 'error'));
      } finally {
        controller.close();
      }
    },
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const schemaName = await resolveProjectSchema(id, user.id);
  if (!schemaName) {
    return NextResponse.json({ error: 'Проект не найден' }, { status: 404 });
  }

  let message: string;
  try {
    const body = (await request.json()) as { message?: unknown };
    message = typeof body.message === 'string' ? body.message.trim() : '';
  } catch {
    return NextResponse.json({ error: 'Введите сообщение' }, { status: 400 });
  }
  if (message.length === 0) {
    return NextResponse.json({ error: 'Введите сообщение' }, { status: 400 });
  }

  // Persist the user's turn before streaming so a provider failure keeps it.
  await saveMessage(schemaName, { role: 'USER', content: message });

  const history = toProviderMessages(await listMessages(schemaName));
  const config = buildChatConfig(readSystemPrompt());
  const body = streamAssistantReply(schemaName, history, config);

  return new Response(body, { headers: SSE_HEADERS });
}
