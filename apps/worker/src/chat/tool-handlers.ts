/**
 * Task / plan / code / spec tools for chat:run (Prisma + queue only).
 */

import { getProjectClient, getPublicClient } from '@aiflow/db';
import { getCodeQueue, getPlanQueue, type CodeExecutePayload } from '@aiflow/queue';

import { generateSpecification } from './generate-spec';
import type { ToolExecContext, ToolResult } from './tool-execute';
import { executeDeploy, executeListFiles, executeReadFile } from './tool-handlers-pro';

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

/** `spec:generate`. */
export async function executeSpecGenerate(ctx: ToolExecContext): Promise<ToolResult> {
  try {
    const view = await generateSpecification(ctx.schemaName, () => ctx.resolved.provider, {
      model: ctx.resolved.chatConfig.model,
      apiKey: ctx.resolved.chatConfig.apiKey,
      systemPrompt: '',
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
    return errResult('spec:generate', message);
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

/** Enqueue plan:generate. */
export async function executeRunPlanner(ctx: ToolExecContext): Promise<ToolResult> {
  const gated = requirePro(ctx, 'run_planner');
  if (gated) return gated;
  try {
    const spec = await getProjectClient(ctx.schemaName).specification.findFirst({
      where: { deletedAt: null, approvedAt: { not: null } },
      orderBy: { version: 'desc' },
      select: { id: true, version: true },
    });
    if (!spec) return errResult('run_planner', 'Сначала утвердите спецификацию');
    const jobId = `plan-${spec.id}-${String(Date.now())}`;
    await getPlanQueue().add(
      'plan:generate',
      {
        projectId: ctx.projectId,
        schemaName: ctx.schemaName,
        specificationId: spec.id,
        specificationVersion: spec.version,
      },
      { jobId },
    );
    return {
      heading: 'Планировщик',
      content: {
        status: 'queued',
        jobId,
        specificationId: spec.id,
        specificationVersion: spec.version,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось запустить планировщик';
    return errResult('run_planner', message);
  }
}

/** Enqueue code:execute dry-run. */
export async function executeRunCoder(ctx: ToolExecContext, args: unknown): Promise<ToolResult> {
  const gated = requirePro(ctx, 'run_coder');
  if (gated) return gated;
  try {
    const taskId = await resolveTaskId(ctx.schemaName, args);
    if (!taskId) return errResult('run_coder', 'Укажите taskId или title существующей задачи');
    const meta = await getPublicClient().projectMeta.findUnique({
      where: { id: ctx.projectId, deletedAt: null },
      select: {
        ownerId: true,
        schemaName: true,
        giteaOwner: true,
        giteaRepo: true,
        giteaDefaultBranch: true,
      },
    });
    if (!meta || meta.ownerId !== ctx.ownerId) return errResult('run_coder', 'Проект не найден');
    if (!meta.giteaOwner || !meta.giteaRepo) {
      return errResult('run_coder', 'Репозиторий Gitea не настроен');
    }
    const payload: CodeExecutePayload = {
      projectId: ctx.projectId,
      schemaName: meta.schemaName,
      taskId,
      giteaOwner: meta.giteaOwner,
      giteaRepo: meta.giteaRepo,
      giteaDefaultBranch: meta.giteaDefaultBranch || 'main',
      dryRun: true,
    };
    const jobId = `code-${taskId}-${String(Date.now())}`;
    await getCodeQueue().add('code:execute', payload, { jobId });
    return {
      heading: 'Кодер',
      content: { status: 'queued', taskId, jobId, dryRun: true },
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

async function listTasks(schemaName: string) {
  const rows = await getProjectClient(schemaName).task.findMany({
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      sortOrder: true,
      specificationId: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    priority: r.priority,
    sortOrder: r.sortOrder,
    specificationId: r.specificationId,
    createdAt: r.createdAt.toISOString(),
  }));
}

async function getTaskDetail(schemaName: string, taskId: string) {
  const task = await getProjectClient(schemaName).task.findFirst({
    where: { id: taskId, deletedAt: null },
  });
  if (!task) return null;
  const logs = await getProjectClient(schemaName).taskLog.findMany({
    where: { taskId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    description: task.description,
    logs: logs.map((l) => ({
      id: l.id,
      level: l.level,
      message: l.message,
      createdAt: l.createdAt.toISOString(),
    })),
  };
}

export { executeDeploy, executeListFiles, executeReadFile };
