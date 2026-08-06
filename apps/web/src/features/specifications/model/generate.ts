/**
 * Non-streaming SPEC.md generation against the Analyst template.
 *
 * The slice cannot import `@/features/chat` or `@/features/files` directly: the
 * eslint `boundaries/dependencies` policy uses `capture: slice`, so a cross-
 * slice feature→feature import is a hard error (only `app/` routes may wire
 * slices together — see eslint.config.mjs § boundaries/elements). The
 * generation logic, however, is genuinely specifications-scoped and belongs in
 * this slice, not in the route. We resolve the tension with dependency
 * injection: the route (in `app/`) supplies the chat/files functions and the
 * model config, and this module orchestrates them. That keeps the route thin
 * and the orchestrator testable in isolation (task 16) without smuggling
 * cross-slice imports past the boundary rule.
 *
 * Flow: load chat history → find last USER turn → retrieve RAG context for it
 * → build a single user turn holding dialog + context → drain the provider
 * stream to a string → persist it as the next specification version. The
 * provider throws on failure; the caller (route) maps any throw to 500.
 */
import type { ChatConfig, ChatMessage, ModelProvider } from '@aiflow/ai-roles';

import { createSpecificationVersion } from './service';
import type { SpecificationView } from './types';

/**
 * Minimal shape of a chat message view this orchestrator consumes. Defined
 * locally rather than imported from `@/features/chat` so this slice stays free
 * of cross-slice feature→feature imports (the eslint `boundaries/dependencies`
 * policy uses `capture: slice`). Structurally identical to `ChatMessageView`.
 */
interface ChatTurn {
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
}

/** Functions the route injects so this slice stays free of cross-slice imports. */
export interface GenerationDeps {
  /** All chat messages in a project (oldest first). From `@/features/chat`. */
  listMessages: (schemaName: string) => Promise<ChatTurn[]>;
  /** RAG context for a query; never throws. From `@/features/files`. */
  retrieveContext: (schemaName: string, query: string) => Promise<string>;
  /** The SPEC.md template block. From `@/features/chat` (`readSpecTemplate`). */
  readSpecTemplate: () => string;
  /** Fresh provider instance. The route owns env-based config resolution. */
  createProvider: () => ModelProvider;
  /** Model + key + system prompt for this generation. */
  config: ChatConfig;
}

/**
 * Build the user turn: every message joined (role-tagged so the model can tell
 * turns apart), then the RAG context appended if non-empty. The dialog is the
 * signal; the context is supporting material the model should fold in.
 */
function buildUserTurn(messages: ChatTurn[], ragContext: string): string {
  const dialog = messages.map((m) => `[${m.role}]: ${m.content}`).join('\n\n');
  return ragContext ? `${dialog}\n\n${ragContext}` : dialog;
}

/**
 * Compose the system prompt that tells the model to follow the SPEC template
 * exactly. The template headings are fixed (the Planner parses them); prose
 * inside is generated in the user's language.
 */
function buildSystemPrompt(template: string): string {
  return (
    'Based on the interview below, produce SPEC.md following this template ' +
    'exactly:\n\n' +
    template
  );
}

/** Drain an `AsyncIterable<string>` provider stream into one string. */
async function collectChat(stream: AsyncIterable<string>): Promise<string> {
  let full = '';
  for await (const chunk of stream) {
    full += chunk;
  }
  return full;
}

/**
 * Generate one specification version from the project's chat history and RAG
 * context. Returns the persisted {@link SpecificationView}; throws on any
 * provider failure (the route maps to 500).
 */
export async function generateSpecification(
  schemaName: string,
  deps: GenerationDeps,
): Promise<SpecificationView> {
  const messages = await deps.listMessages(schemaName);

  const lastUser = [...messages].reverse().find((m) => m.role === 'USER');
  let ragContext = '';
  if (lastUser) {
    // `retrieveContext` never throws; the try/catch is belt-and-suspenders per
    // the SPEC — an embed/pgvector failure degrades to generation-without-RAG.
    try {
      ragContext = await deps.retrieveContext(schemaName, lastUser.content);
    } catch {
      ragContext = '';
    }
  }

  const template = deps.readSpecTemplate();
  const systemPrompt = buildSystemPrompt(template);
  const userTurn = buildUserTurn(messages, ragContext);

  const provider = deps.createProvider();
  const chatMessages: ChatMessage[] = [{ role: 'USER', content: userTurn }];
  const stream = provider.chat(chatMessages, { ...deps.config, systemPrompt });
  const fullText = await collectChat(stream);

  return createSpecificationVersion(schemaName, fullText);
}
