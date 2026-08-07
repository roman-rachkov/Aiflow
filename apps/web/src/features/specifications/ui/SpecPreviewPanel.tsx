/**
 * SpecPreviewPanel — right-column Markdown preview + Approve / Start generation.
 *
 * Russian copy for the Customer flow (docs/09 §4). Markdown via react-markdown.
 * Start generation navigates to /tasks, where the TasksPanel enqueues
 * `plan:generate` (handled by `apps/worker/src/plan/handler.ts`) and polls
 * for task status.
 */
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

import { Button, Spinner } from '@aiflow/ui';

export type SpecPreviewPanelProps = {
  projectId: string;
  version: number | null;
  content: string | null;
  approvedAt: Date | null;
  loading: boolean;
  onApproved: (approvedAt: Date) => void;
};

export function SpecPreviewPanel(props: SpecPreviewPanelProps) {
  const { projectId, version, content, approvedAt, loading, onApproved } = props;
  const router = useRouter();
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isApproved = approvedAt != null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h2 className="text-sm font-medium text-fg">
          {version != null ? `SPEC.md · v${String(version)}` : 'SPEC.md'}
        </h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <PreviewBody loading={loading} content={content} />
      </div>
      {error ? <p className="shrink-0 px-3 pb-1 text-xs text-danger">{error}</p> : null}
      <PreviewActions
        version={version}
        content={content}
        loading={loading}
        isApproved={isApproved}
        approving={approving}
        onApprove={() => {
          void approveSpec({ projectId, version, setApproving, setError, onApproved });
        }}
        onStart={() => {
          router.push(`/projects/${projectId}/tasks`);
        }}
      />
    </div>
  );
}

function PreviewBody({ loading, content }: { loading: boolean; content: string | null }) {
  if (loading) return <Spinner size="sm" label="Загрузка версии" />;
  if (content == null) {
    return (
      <p className="text-sm text-fg-muted">
        Создайте спецификацию из чата — превью появится здесь.
      </p>
    );
  }
  return (
    <div className="prose-spec text-sm text-fg [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:text-sm [&_h2]:font-semibold [&_li]:my-0.5 [&_p]:my-1.5 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-4">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}

function PreviewActions(props: {
  version: number | null;
  content: string | null;
  loading: boolean;
  isApproved: boolean;
  approving: boolean;
  onApprove: () => void;
  onStart: () => void;
}) {
  const { version, content, loading, isApproved, approving, onApprove, onStart } = props;
  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-border px-3 py-2">
      <Button
        size="sm"
        disabled={version == null || content == null || isApproved || approving || loading}
        onClick={onApprove}
      >
        {approving ? <Spinner size="sm" label={null} /> : null}
        {isApproved ? 'Утверждена' : 'Утвердить спецификацию'}
      </Button>
      {isApproved ? (
        <Button size="sm" variant="secondary" onClick={onStart}>
          Запустить генерацию
        </Button>
      ) : null}
    </div>
  );
}

type ApproveOpts = {
  projectId: string;
  version: number | null;
  setApproving: (v: boolean) => void;
  setError: (v: string | null) => void;
  onApproved: (approvedAt: Date) => void;
};

async function approveSpec({
  projectId,
  version,
  setApproving,
  setError,
  onApproved,
}: ApproveOpts) {
  if (version == null) return;
  setApproving(true);
  setError(null);
  try {
    const res = await fetch(
      `/api/projects/${projectId}/specifications/${String(version)}/approve`,
      { method: 'POST' },
    );
    if (!res.ok) throw new Error('approve failed');
    const data = (await res.json()) as { approvedAt: string };
    onApproved(new Date(data.approvedAt));
  } catch {
    setError('Не удалось утвердить спецификацию');
  } finally {
    setApproving(false);
  }
}
