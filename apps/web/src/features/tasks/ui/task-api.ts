import type { EnqueuePlanResult } from '../model/types';

/** POST plan:generate enqueue. */
export async function postPlan(
  projectId: string,
): Promise<{ toast: string; ok: boolean; result?: EnqueuePlanResult }> {
  const res = await fetch(`/api/projects/${projectId}/tasks/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    jobId?: string;
    specificationId?: string;
    specificationVersion?: number;
  };
  if (!res.ok) return { toast: body.error ?? 'Не удалось запустить планирование', ok: false };
  const version = body.specificationVersion;
  const versionLabel = typeof version === 'number' ? String(version) : '?';
  const result =
    body.jobId && body.specificationId && typeof version === 'number'
      ? {
          jobId: body.jobId,
          specificationId: body.specificationId,
          specificationVersion: version,
        }
      : undefined;
  return {
    toast: `План поставлен в очередь (SPEC v${versionLabel})`,
    ok: true,
    result,
  };
}

/** POST execute or confirm for a task. */
export async function postCode(
  projectId: string,
  taskId: string,
  action: 'dry' | 'confirm' | 'run',
): Promise<{ toast: string; ok: boolean }> {
  const url =
    action === 'confirm'
      ? `/api/projects/${projectId}/tasks/${taskId}/confirm`
      : `/api/projects/${projectId}/tasks/${taskId}/execute`;
  const body = action === 'confirm' ? undefined : JSON.stringify({ dryRun: action === 'dry' });
  const res = await fetch(url, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) return { toast: data.error ?? 'Не удалось запустить кодер', ok: false };
  const labels = {
    dry: 'Dry-run поставлен в очередь',
    confirm: 'Выполнение подтверждено',
    run: 'Кодер поставлен в очередь',
  };
  return { toast: labels[action], ok: true };
}

/** POST run-plan: enqueue unblocked PENDING tasks. */
export async function postRunPlan(projectId: string): Promise<{ toast: string; ok: boolean }> {
  const res = await fetch(`/api/projects/${projectId}/tasks/run-plan`, { method: 'POST' });
  const data = (await res.json().catch(() => ({}))) as { error?: string; taskIds?: string[] };
  if (!res.ok) return { toast: data.error ?? 'Не удалось запустить план', ok: false };
  const count = data.taskIds?.length ?? 0;
  if (count === 0) {
    return { toast: 'Нет задач, готовых к запуску', ok: true };
  }
  return { toast: `В очередь: ${String(count)} задач`, ok: true };
}
