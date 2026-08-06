'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { EditorShell } from '@/features/editor/client';

/** Editor page client: «Сборка» enqueues deploy:run then opens deployments. */
export function EditorPageClient({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onBuild() {
    if (busy) return;
    setBusy(true);
    try {
      await startDeployAndNavigate(projectId, router, setToast);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <BuildToast
        message={toast}
        onDismiss={() => {
          setToast(null);
        }}
      />
      <EditorShell
        projectId={projectId}
        onBuild={() => {
          void onBuild();
        }}
      />
    </div>
  );
}

function BuildToast({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="absolute top-2 right-2 z-10 rounded-md border border-border bg-surface px-3 py-2 text-sm shadow"
    >
      {message}
      <button type="button" className="ml-2 text-fg-muted" onClick={onDismiss}>
        ×
      </button>
    </div>
  );
}

async function startDeployAndNavigate(
  projectId: string,
  router: ReturnType<typeof useRouter>,
  setToast: (v: string | null) => void,
): Promise<void> {
  try {
    const res = await fetch(`/api/projects/${projectId}/deployments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      deploymentId?: string;
    };
    if (!res.ok) {
      setToast(body.error ?? 'Не удалось запустить сборку');
      return;
    }
    const q = body.deploymentId ? `?highlight=${body.deploymentId}` : '';
    router.push(`/projects/${projectId}/deployments${q}`);
  } catch {
    setToast('Не удалось запустить сборку');
  }
}
