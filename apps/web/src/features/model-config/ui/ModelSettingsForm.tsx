'use client';

import { Button, Spinner } from '@aiflow/ui';

import { ModelSettingsReady } from './ModelSettingsReady';
import { useModelSettings } from './useModelSettings';

type Props = { projectId: string };

/**
 * Analyst ModelConfig form (Russian copy per SPEC). Loads GET, saves PUT,
 * clearApiKey via «Удалить ключ». Never displays plaintext keys.
 */
export function ModelSettingsForm({ projectId }: Props) {
  const s = useModelSettings(projectId);

  if (s.loading) {
    return (
      <div className="flex items-center gap-3 text-fg-muted">
        <Spinner size="sm" label="Загрузка" />
        <span>Загрузка настроек…</span>
      </div>
    );
  }

  if (s.error) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-danger" role="alert">
          {s.error}
        </p>
        <Button type="button" variant="secondary" onClick={() => void s.load()}>
          Повторить
        </Button>
      </div>
    );
  }

  return (
    <ModelSettingsReady
      form={s.form}
      source={s.source}
      hasApiKey={s.hasApiKey}
      saving={s.saving}
      toast={s.toast}
      onChange={s.setFormPatch}
      onSave={() => {
        void s.save();
      }}
      onClearKey={() => {
        void s.clearKey();
      }}
    />
  );
}
