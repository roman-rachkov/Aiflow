'use client';

import { useState } from 'react';

import { EditorShell } from '@/features/editor/client';

/**
 * Client wrapper for Build stub toast (deployments route arrives in Task 2.3).
 */
export function EditorPageClient({ projectId }: { projectId: string }) {
  const [toast, setToast] = useState<string | null>(null);

  return (
    <div className="relative">
      {toast ? (
        <div
          role="status"
          className="absolute top-2 right-2 z-10 rounded-md border border-border bg-surface px-3 py-2 text-sm shadow"
        >
          {toast}
          <button
            type="button"
            className="ml-2 text-fg-muted"
            onClick={() => {
              setToast(null);
            }}
          >
            ×
          </button>
        </div>
      ) : null}
      <EditorShell
        projectId={projectId}
        onBuild={() => {
          setToast('Сборка будет доступна в следующем этапе');
        }}
      />
    </div>
  );
}
