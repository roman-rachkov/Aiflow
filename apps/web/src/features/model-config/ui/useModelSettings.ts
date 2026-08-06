'use client';

import { useEffect, useState } from 'react';

import type { FormState } from './form-helpers';
import { useModelConfigLoad, useModelConfigPut } from './useModelSettingsFetch';

type HookResult = {
  loading: boolean;
  saving: boolean;
  error: string | null;
  toast: string | null;
  source: 'project' | 'env';
  hasApiKey: boolean;
  form: FormState;
  load: () => Promise<void>;
  setFormPatch: (patch: Partial<FormState>) => void;
  save: () => Promise<void>;
  clearKey: () => Promise<void>;
};

/** State + fetch helpers for the Analyst ModelConfig form. */
export function useModelSettings(projectId: string): HookResult {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [source, setSource] = useState<'project' | 'env'>('env');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());

  const load = useModelConfigLoad(projectId, {
    setLoading,
    setError,
    setForm,
    setHasApiKey,
    setSource,
  });
  const put = useModelConfigPut(projectId, {
    setSaving,
    setToast,
    setError,
    setForm,
    setHasApiKey,
    setSource,
  });

  useEffect(() => {
    void load();
  }, [load]);

  return {
    loading,
    saving,
    error,
    toast,
    source,
    hasApiKey,
    form,
    load,
    setFormPatch: (patch) => {
      setForm((f) => ({ ...f, ...patch }));
    },
    save: () => put(saveBody(form), 'Настройки сохранены'),
    clearKey: () => put(clearBody(form), 'Ключ проекта удалён'),
  };
}

function emptyForm(): FormState {
  return { provider: 'openai', model: '', baseURL: '', apiKey: '' };
}

function saveBody(form: FormState) {
  return {
    analyst: {
      provider: form.provider,
      model: form.model,
      baseURL: form.baseURL || null,
      apiKey: form.apiKey || null,
    },
  };
}

function clearBody(form: FormState) {
  return {
    analyst: {
      provider: form.provider,
      model: form.model,
      baseURL: form.baseURL || null,
    },
    clearApiKey: true,
  };
}
