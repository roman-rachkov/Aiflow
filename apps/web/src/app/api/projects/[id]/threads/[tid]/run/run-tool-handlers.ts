/**
 * Stage E task/plan/code tools + Stage C `spec:generate`.
 * Call feature services directly (no HTTP). Pro-gated tools check `uiMode`.
 */

import { listMessages, readSpecTemplate } from '@/features/chat';
import { retrieveContext } from '@/features/files/rag';
import { generateSpecification } from '@/features/specifications';
import {
  enqueueExecute,
  enqueuePlan,
  getTaskDetail,
  listTasks,
  PlanSpecRequiredError,
  resolveCodeContext,
} from '@/features/tasks';

import type { ToolExecContext, ToolResult } from './run-tools';

const SPEC_GENERATE_TOOL = 'spec:generate';
const PRO_REQUIRED = 'Требуется Pro';

function requirePro(ctx: ToolExecContext, heading: string): ToolResult | null {
  if (ctx.uiMode === 'PRO') return null;
  return { heading, content: { error: PRO_REQUIRED }, error: true };
}

function errResult(heading: string, message: string): ToolResult {
  return { heading, content: { error: message }, error: true };
}

function asRecord(args: unknown): Record<string, unknown> {
  return args && typeof args === 'object' && !Array.isArray(args)
    ? (args as Record<string, unknown>)
    : {};
}

function strField(args: unknown, key: string): string | undefined {
  const v = asRecord(args)[key];
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
}

/** `spec:generate` — produce a SPEC.md version from the conversation. */
export async function executeSpecGenerate(ctx: ToolExecContext): Promise<ToolResult> {
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
    return errResult(SPEC_GENERATE_TOOL, message);
  }
}

/** List non-deleted project tasks. */
export async function executeListTasks(ctx: ToolExecContext): Promise<ToolResult> {
  const tasks = await listTasks(ctx.schemaName);
  return { heading: 'Задачи', content: { tasks } };
}

/** One task + recent TaskLog entries. */
export async function executeTaskStatus(ctx: ToolExecContext, args: unknown): Promise<ToolResult> {
  const taskId = strField(args, 'taskId');
  if (!taskId) return errResult('task_status', 'Укажите taskId');
  const detail = await getTaskDetail(ctx.schemaName, taskId);
  if (!detail) return errResult('task_status', 'Задача не найдена');
  const { logs, ...task } = detail;
  return { heading: task.title, content: { task, logs } };
}

/** Enqueue plan:generate (fire-and-forget). */
export async function executeRunPlanner(ctx: ToolExecContext): Promise<ToolResult> {
  const gated = requirePro(ctx, 'run_planner');
  if (gated) return gated;
  try {
    const result = await enqueuePlan(ctx.projectId, ctx.schemaName);
    return {
      heading: 'Планировщик',
      content: { status: 'queued', ...result },
    };
  } catch (error) {
    if (error instanceof PlanSpecRequiredError) {
      return errResult('run_planner', 'Сначала утвердите спецификацию');
    }
    const message = error instanceof Error ? error.message : 'Не удалось запустить планировщик';
    return errResult('run_planner', message);
  }
}

/** Enqueue code:execute dry-run for a task (by id or title). */
export async function executeRunCoder(ctx: ToolExecContext, args: unknown): Promise<ToolResult> {
  const gated = requirePro(ctx, 'run_coder');
  if (gated) return gated;
  try {
    const taskId = await resolveTaskId(ctx.schemaName, args);
    if (!taskId) return errResult('run_coder', 'Укажите taskId или title существующей задачи');
    const codeCtx = await resolveCodeContext(ctx.projectId, ctx.ownerId);
    if (!codeCtx) return errResult('run_coder', 'Проект не найден');
    const result = await enqueueExecute(codeCtx, taskId, true);
    return {
      heading: 'Кодер',
      content: {
        status: 'queued',
        taskId: result.taskId,
        jobId: result.jobId,
        dryRun: true,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось запустить кодер';
    return errResult('run_coder', message);
  }
}

async function resolveTaskId(schemaName: string, args: unknown): Promise<string | null> {
  const taskId = strField(args, 'taskId');
  if (taskId) return taskId;
  const title = strField(args, 'title');
  if (!title) return null;
  const tasks = await listTasks(schemaName);
  const lower = title.toLowerCase();
  const exact = tasks.find((t) => t.title.toLowerCase() === lower);
  if (exact) return exact.id;
  const partial = tasks.find((t) => t.title.toLowerCase().includes(lower));
  return partial?.id ?? null;
}

export { executeDeploy, executeListFiles, executeReadFile } from './run-tool-handlers-pro';
