/**
 * Pro-gated Stage E tools: deploy + editor tree/file reads.
 */

import { createDeployment, resolveDeployContext } from '@/features/deploy';
import {
  getFileContent,
  isBinaryFileError,
  isNotFoundError,
  listTree,
  resolveEditorContext,
} from '@/features/editor';

import type { ToolExecContext, ToolResult } from './run-tools';

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

/** Create a BUILDING deployment (fire-and-forget). */
export async function executeDeploy(ctx: ToolExecContext): Promise<ToolResult> {
  const gated = requirePro(ctx, 'deploy');
  if (gated) return gated;
  try {
    const deployCtx = await resolveDeployContext(ctx.projectId, ctx.ownerId);
    if (!deployCtx) return errResult('deploy', 'Проект не найден');
    const result = await createDeployment(deployCtx);
    return {
      heading: 'Деплой',
      content: { deploymentId: result.deploymentId, status: result.status },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось запустить деплой';
    return errResult('deploy', message);
  }
}

/** List repo tree entries (Pro). */
export async function executeListFiles(ctx: ToolExecContext, args: unknown): Promise<ToolResult> {
  const gated = requirePro(ctx, 'list_files');
  if (gated) return gated;
  try {
    const editorCtx = await resolveEditorContext(ctx.projectId, ctx.ownerId);
    if (!editorCtx) return errResult('list_files', 'Проект не найден');
    const tree = await listTree(editorCtx, {
      path: strField(args, 'path'),
      ref: strField(args, 'ref'),
    });
    return { heading: 'Файлы', content: { tree } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось прочитать дерево';
    return errResult('list_files', message);
  }
}

/** Read one file from the project repo (Pro). */
export async function executeReadFile(ctx: ToolExecContext, args: unknown): Promise<ToolResult> {
  const gated = requirePro(ctx, 'read_file');
  if (gated) return gated;
  const path = strField(args, 'path');
  if (!path) return errResult('read_file', 'Укажите path');
  try {
    const editorCtx = await resolveEditorContext(ctx.projectId, ctx.ownerId);
    if (!editorCtx) return errResult('read_file', 'Проект не найден');
    const file = await getFileContent(editorCtx, path, strField(args, 'ref'));
    return { heading: path, content: { path: file.path, content: file.content, sha: file.sha } };
  } catch (error) {
    if (isNotFoundError(error)) return errResult('read_file', 'Файл не найден');
    if (isBinaryFileError(error)) return errResult('read_file', 'Бинарный файл');
    const message = error instanceof Error ? error.message : 'Не удалось прочитать файл';
    return errResult('read_file', message);
  }
}
