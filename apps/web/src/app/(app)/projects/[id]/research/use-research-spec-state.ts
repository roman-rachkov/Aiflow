/**
 * SPEC state hook for ResearchWorkspace — keeps the component under the
 * max-lines-per-function budget.
 */
'use client';

import { useCallback, useState } from 'react';

import type { SpecificationListItemView } from '@/features/specifications';

import { loadVersion, runCreateSpec, type PreviewState } from './research-spec-actions';

const emptyPreview: PreviewState = {
  version: null,
  content: null,
  approvedAt: null,
  loading: false,
};

export function useResearchSpecState(projectId: string, initialSpecs: SpecificationListItemView[]) {
  const [specs, setSpecs] = useState(initialSpecs);
  const [preview, setPreview] = useState<PreviewState>(emptyPreview);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showArtifacts, setShowArtifacts] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const selectVersion = useCallback(
    (version: number) => {
      void loadVersion({ projectId, version, specs, setPreview });
      setShowPreview(true);
    },
    [projectId, specs],
  );

  const createSpec = useCallback(() => {
    void runCreateSpec({
      projectId,
      setSpecs,
      setPreview,
      setCreating,
      setCreateError,
      setShowPreview,
    });
  }, [projectId]);

  const onApproved = useCallback((approvedAt: Date) => {
    setPreview((prev) => {
      if (prev.version == null) return prev;
      setSpecs((list) => list.map((s) => (s.version === prev.version ? { ...s, approvedAt } : s)));
      return { ...prev, approvedAt };
    });
  }, []);

  return {
    specs,
    preview,
    creating,
    createError,
    showArtifacts,
    showPreview,
    setShowArtifacts,
    setShowPreview,
    selectVersion,
    createSpec,
    onApproved,
  };
}
