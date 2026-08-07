/**
 * SPEC fetch/create helpers for ResearchWorkspace. Kept separate so the
 * workspace component stays under the file size budget.
 */
import type { Dispatch, SetStateAction } from 'react';

import type { SpecificationListItemView } from '@/features/specifications';

export type PreviewState = {
  version: number | null;
  content: string | null;
  approvedAt: Date | null;
  loading: boolean;
};

type LoadOpts = {
  projectId: string;
  version: number;
  specs: SpecificationListItemView[];
  setPreview: Dispatch<SetStateAction<PreviewState>>;
};

export async function loadVersion({ projectId, version, specs, setPreview }: LoadOpts) {
  const meta = specs.find((s) => s.version === version);
  setPreview({
    version,
    content: null,
    approvedAt: meta?.approvedAt ?? null,
    loading: true,
  });
  try {
    const res = await fetch(`/api/projects/${projectId}/specifications/${String(version)}`);
    if (!res.ok) throw new Error('fetch failed');
    const data = (await res.json()) as {
      content: string;
      approvedAt: string | null;
    };
    setPreview({
      version,
      content: data.content,
      approvedAt: data.approvedAt ? new Date(data.approvedAt) : (meta?.approvedAt ?? null),
      loading: false,
    });
  } catch {
    setPreview({
      version,
      content: null,
      approvedAt: meta?.approvedAt ?? null,
      loading: false,
    });
  }
}

type CreateOpts = {
  projectId: string;
  setSpecs: Dispatch<SetStateAction<SpecificationListItemView[]>>;
  setPreview: Dispatch<SetStateAction<PreviewState>>;
  setCreating: (v: boolean) => void;
  setCreateError: (v: string | null) => void;
  setShowPreview: (v: boolean) => void;
};

export async function runCreateSpec({
  projectId,
  setSpecs,
  setPreview,
  setCreating,
  setCreateError,
  setShowPreview,
}: CreateOpts) {
  setCreating(true);
  setCreateError(null);
  try {
    const res = await fetch(`/api/projects/${projectId}/specifications`, { method: 'POST' });
    if (!res.ok) throw new Error('create failed');
    const created = (await res.json()) as {
      id: string;
      version: number;
      content: string;
      createdAt: string;
    };
    const item: SpecificationListItemView = {
      id: created.id,
      version: created.version,
      createdAt: new Date(created.createdAt),
      createdBy: 'AI',
      approvedAt: null,
    };
    setSpecs((prev) => [item, ...prev]);
    setPreview({
      version: created.version,
      content: created.content,
      approvedAt: null,
      loading: false,
    });
    setShowPreview(true);
  } catch {
    setCreateError('Не удалось создать спецификацию');
  } finally {
    setCreating(false);
  }
}
