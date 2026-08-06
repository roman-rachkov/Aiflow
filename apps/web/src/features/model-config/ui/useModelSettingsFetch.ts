'use client';

import { useCallback, type Dispatch, type SetStateAction } from 'react';

import type { ModelConfigResponse } from '../model/types';
import { applyResponse, readErrorMessage, type FormState } from './form-helpers';

type LoadSetters = {
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
  setForm: Dispatch<SetStateAction<FormState>>;
  setHasApiKey: (v: boolean) => void;
  setSource: (v: 'project' | 'env') => void;
};

type PutSetters = {
  setSaving: (v: boolean) => void;
  setToast: (v: string | null) => void;
  setError: (v: string | null) => void;
  setForm: Dispatch<SetStateAction<FormState>>;
  setHasApiKey: (v: boolean) => void;
  setSource: (v: 'project' | 'env') => void;
};

/** GET ModelConfig into form state. */
export function useModelConfigLoad(projectId: string, s: LoadSetters) {
  const { setLoading, setError, setForm, setHasApiKey, setSource } = s;
  return useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/model-config`);
      if (!res.ok) throw new Error(await readErrorMessage(res));
      applyResponse((await res.json()) as ModelConfigResponse, setForm, setHasApiKey, setSource);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить');
    } finally {
      setLoading(false);
    }
  }, [projectId, setLoading, setError, setForm, setHasApiKey, setSource]);
}

/** PUT ModelConfig and refresh local form state. */
export function useModelConfigPut(projectId: string, s: PutSetters) {
  const { setSaving, setToast, setError, setForm, setHasApiKey, setSource } = s;
  return useCallback(
    async (body: unknown, okToast: string) => {
      setSaving(true);
      setToast(null);
      setError(null);
      try {
        const res = await fetch(`/api/projects/${projectId}/model-config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(await readErrorMessage(res));
        applyResponse((await res.json()) as ModelConfigResponse, setForm, setHasApiKey, setSource);
        setForm((f) => ({ ...f, apiKey: '' }));
        setToast(okToast);
      } catch (err) {
        setToast(err instanceof Error ? err.message : 'Ошибка запроса');
      } finally {
        setSaving(false);
      }
    },
    [projectId, setSaving, setToast, setError, setForm, setHasApiKey, setSource],
  );
}
