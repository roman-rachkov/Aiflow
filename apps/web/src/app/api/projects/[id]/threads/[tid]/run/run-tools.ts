/**
 * Tool definitions + server-side executors for the tool-aware chat run.
 *
 * The `/run` route hands `TOOL_DEFINITIONS` to the model; when the model emits
 * a tool call, `executeTool` runs the matching server-side action and returns a
 * result object that is emitted as the AG-UI `TOOL_CALL_RESULT`. For Stage C
 * the only tool is `spec:generate`, which produces a SPEC.md via the existing
 * `generateSpecification` service. New tools (Stage E) register here.
 */

import type { ToolDefinition } from '@aiflow/ai-roles';

import { listMessages, readSpecTemplate } from '@/features/chat';
import { retrieveContext } from '@/features/files/rag';
import { generateSpecification } from '@/features/specifications';
import type { ResolvedAnalystProvider } from '@/features/model-config';

/** The tool names this run advertises to the model. Kept in sync with EXECUTORS. */
export const SPEC_GENERATE_TOOL = 'spec:generate';

/** Tool definitions forwarded to the model (OpenAI `tools` payload). */
export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: SPEC_GENERATE_TOOL,
      description:
        'Сгенерировать спецификацию SPEC.md из текущего диалога. Вызывай, когда пользователь просит оформить идею в спецификацию или готов перейти к плану.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
];

/** Result of a tool execution — the AG-UI `TOOL_CALL_RESULT` content. */
export interface ToolResult {
  /** Stable id for artifact registration (e.g. the SPEC id). */
  id?: string;
  /** Version for artifact versioning (e.g. the SPEC version number). */
  version?: number;
  /** Human-readable heading shown in the workspace rail. */
  heading: string;
  /** The tool's structured payload, fed to the artifact renderer's parser. */
  content: unknown;
  /** When true, the execution failed; `content` carries `{ error }`. */
  error?: boolean;
}

/** Execute one tool call server-side. Returns a result for AG-UI emission. */
export async function executeTool(
  name: string,
  args: unknown,
  ctx: { schemaName: string; resolved: ResolvedAnalystProvider },
): Promise<ToolResult> {
  if (name === SPEC_GENERATE_TOOL) {
    return executeSpecGenerate(ctx);
  }
  return { heading: name, content: { error: `Неизвестный инструмент: ${name}` }, error: true };
}

/** `spec:generate` — produce a SPEC.md version from the conversation. */
async function executeSpecGenerate(ctx: {
  schemaName: string;
  resolved: ResolvedAnalystProvider;
}): Promise<ToolResult> {
  try {
    const view = await generateSpecification(ctx.schemaName, {
      listMessages,
      retrieveContext,
      readSpecTemplate,
      createProvider: () => ctx.resolved.provider,
      config: {
        model: ctx.resolved.chatConfig.model,
        apiKey: ctx.resolved.chatConfig.apiKey,
        systemPrompt: '',
      },
    });
    return {
      id: view.id,
      version: view.version,
      heading: `SPEC.md · v${String(view.version)}`,
      content: {
        id: view.id,
        version: view.version,
        content: view.content,
        createdAt: view.createdAt,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Не удалось сгенерировать спецификацию';
    return { heading: SPEC_GENERATE_TOOL, content: { error: message }, error: true };
  }
}
