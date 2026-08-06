import type { AnalystConfigPublic, ModelConfigResponse } from '../model/types';
import type { AnalystProviderId } from '../model/types';

export type FormState = {
  provider: AnalystProviderId;
  model: string;
  baseURL: string;
  apiKey: string;
};

export function applyResponse(
  data: ModelConfigResponse,
  setForm: (fn: (f: FormState) => FormState) => void,
  setHasApiKey: (v: boolean) => void,
  setSource: (v: 'project' | 'env') => void,
): void {
  const a: AnalystConfigPublic = data.analyst;
  setForm((f) => ({
    ...f,
    provider: a.provider,
    model: a.model,
    baseURL: a.baseURL ?? '',
    apiKey: '',
  }));
  setHasApiKey(a.hasApiKey);
  setSource(data.source);
}

export async function readErrorMessage(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? `Ошибка ${String(res.status)}`;
}

export function StatusText({
  source,
  hasApiKey,
}: {
  source: 'project' | 'env';
  hasApiKey: boolean;
}) {
  if (source === 'env') {
    return (
      <p className="text-sm text-fg-muted">
        Конфигурация проекта не задана — используются подсказки окружения сервера
      </p>
    );
  }
  if (!hasApiKey) {
    return (
      <p className="text-sm text-fg-muted">
        Ключ проекта не задан — используется окружение сервера
      </p>
    );
  }
  return <p className="text-sm text-fg-muted">Используется конфигурация проекта</p>;
}
