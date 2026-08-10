/** Tool execution context + result + dispatcher for chat:run. */

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
