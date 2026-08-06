'use client';

import { Button } from '@aiflow/ui';

import { StatusText } from './form-helpers';
import type { FormState } from './form-helpers';
import { ModelSettingsInputs } from './ModelSettingsInputs';

type Props = {
  form: FormState;
  source: 'project' | 'env';
  hasApiKey: boolean;
  saving: boolean;
  toast: string | null;
  onChange: (patch: Partial<FormState>) => void;
  onSave: () => void;
  onClearKey: () => void;
};

/** Ready (non-loading) ModelConfig form body. */
export function ModelSettingsReady(props: Props) {
  const { form, source, hasApiKey, saving, toast, onChange, onSave, onClearKey } = props;
  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-xl font-semibold tracking-tight">Модель Analyst</h1>
      <StatusText source={source} hasApiKey={hasApiKey} />
      <ModelSettingsInputs form={form} hasApiKey={hasApiKey} onChange={onChange} />
      <div className="flex flex-wrap gap-3">
        <Button type="button" disabled={saving} onClick={onSave}>
          {saving ? 'Сохранение…' : 'Сохранить'}
        </Button>
        {hasApiKey ? (
          <Button type="button" variant="danger" disabled={saving} onClick={onClearKey}>
            Удалить ключ
          </Button>
        ) : null}
      </div>
      {toast ? (
        <p className="text-sm text-fg-muted" role="status">
          {toast}
        </p>
      ) : null}
    </div>
  );
}
