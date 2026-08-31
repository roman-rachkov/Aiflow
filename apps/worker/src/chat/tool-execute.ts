/** Tool execution context + result + dispatcher for chat:run. */

import { allowMutatingTool } from '@aiflow/ai-roles';

import type { ResolvedAnalystProvider } from './resolve-provider';
import {
  DEPLOY_TOOL,
  LIST_FILES_TOOL,
  LIST_TASKS_TOOL,
  READ_FILE_TOOL,
  RUN_CODER_TOOL,
  RUN_PLANNER_TOOL,
  SPEC_GENERATE_TOOL,
  TASK_STATUS_TOOL,
} from './tool-defs';
import {
  executeDeploy,
  executeListFiles,
  executeListTasks,
  executeReadFile,
  executeRunCoder,
  executeRunPlanner,
  executeSpecGenerate,
  executeTaskStatus,
} from './tool-handlers';

export interface ToolExecContext {
  schemaName: string;
  projectId: string;
  ownerId: string;
  uiMode: 'BASIC' | 'PRO';
  resolved: ResolvedAnalystProvider;
  /** Latest user turn — used for B4 write-tool intent checks. */
  userMessage: string;
  /** Retrieved RAG block mixed into the system prompt (may be empty). */
  ragContext: string;
}

export interface ToolResult {
  id?: string;
  version?: number;
  heading: string;
  content: unknown;
  error?: boolean;
}

/** Execute one tool call. */
export async function executeTool(
  name: string,
  args: unknown,
  ctx: ToolExecContext,
): Promise<ToolResult> {
  if (!allowMutatingTool(name, ctx.userMessage, ctx.ragContext)) {
    return {
      heading: name,
      content: {
        error:
          'Инструмент заблокирован: подозрительные инструкции в загруженных документах без явного запроса пользователя.',
      },
      error: true,
    };
  }
  switch (name) {
    case SPEC_GENERATE_TOOL:
      return executeSpecGenerate(ctx);
    case LIST_TASKS_TOOL:
      return executeListTasks(ctx);
    case TASK_STATUS_TOOL:
      return executeTaskStatus(ctx, args);
    case RUN_PLANNER_TOOL:
      return executeRunPlanner(ctx);
    case RUN_CODER_TOOL:
      return executeRunCoder(ctx, args);
    case DEPLOY_TOOL:
      return executeDeploy(ctx);
    case LIST_FILES_TOOL:
      return executeListFiles(ctx, args);
    case READ_FILE_TOOL:
      return executeReadFile(ctx, args);
    default:
      return {
        heading: name,
        content: { error: `Неизвестный инструмент: ${name}` },
        error: true,
      };
  }
}
