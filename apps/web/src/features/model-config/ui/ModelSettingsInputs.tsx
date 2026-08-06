'use client';

import { Field, Input } from '@aiflow/ui';

import type { AnalystProviderId } from '../model/types';
import { ANALYST_PROVIDERS } from '../model/types';
import type { FormState } from './form-helpers';

type Props = {
  form: FormState;
  hasApiKey: boolean;
  onChange: (patch: Partial<FormState>) => void;
};

/** Provider / model / baseURL / apiKey fields. */
export function ModelSettingsInputs({ form, hasApiKey, onChange }: Props) {
  return (
    <>
      <Field label="Провайдер">
        <select
          className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg"
          value={form.provider}
          onChange={(e) => {
            onChange({ provider: e.target.value as AnalystProviderId });
          }}
        >
          {ANALYST_PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Модель">
        <Input
          value={form.model}
          onChange={(e) => {
            onChange({ model: e.target.value });
          }}
          placeholder="gpt-4o"
        />
      </Field>
      <Field label="Base URL">
        <Input
          value={form.baseURL}
          onChange={(e) => {
            onChange({ baseURL: e.target.value });
          }}
          placeholder="опционально"
        />
      </Field>
      <Field label="API-ключ">
        <Input
          type="password"
          value={form.apiKey}
          onChange={(e) => {
            onChange({ apiKey: e.target.value });
          }}
          placeholder={hasApiKey ? 'Ключ сохранён (••••)' : 'не задан'}
          autoComplete="off"
        />
      </Field>
    </>
  );
}
