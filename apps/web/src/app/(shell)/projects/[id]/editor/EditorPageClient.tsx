'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ToastProvider, useToast } from '@aiflow/ui';

import { EditorShell } from '@/features/editor/client';

/** Editor page client: wraps shell in ToastProvider for build notifications. */
export function EditorPageClient({ projectId }: { projectId: string }) {
  return (
    <ToastProvider>
      <EditorPageInner projectId={projectId} />
    </ToastProvider>
  );
}

function EditorPageInner({ projectId }: { projectId: string }) {
  const { addToast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onBuild() {
    if (busy) return;
    setBusy(true);
    try {
      await startDeployAndNavigate(projectId, router, (msg) => {
        addToast({ message: msg, variant: 'error' });
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <EditorShell
      projectId={projectId}
      onBuild={() => {
        void onBuild();
      }}
    />
  );
}

async function startDeployAndNavigate(
  projectId: string,
  router: ReturnType<typeof useRouter>,
  onError: (msg: string) => void,
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
      onError(body.error ?? 'Не удалось запустить сборку');
      return;
    }
    const q = body.deploymentId ? `?highlight=${body.deploymentId}` : '';
    router.push(`/projects/${projectId}/deployments${q}`);
  } catch {
    onError('Не удалось запустить сборку');
  }
}
