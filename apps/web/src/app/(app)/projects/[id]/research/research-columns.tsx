/**
 * Column chrome for ResearchWorkspace (left artifacts / right SPEC preview).
 */
'use client';

import Link from 'next/link';

import { Button, Card, CardTitle } from '@aiflow/ui';

import type { FileListItemView } from '@/features/files';
import { FilePanel } from '@/features/files/client';
import type { SpecificationListItemView } from '@/features/specifications';
import { SpecPreviewPanel, SpecificationPanel } from '@/features/specifications/client';

import type { PreviewState } from './research-spec-actions';

export function ArtifactsColumn(props: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  initialFiles: FileListItemView[];
  specs: SpecificationListItemView[];
  selectedVersion: number | null;
  onSelectVersion: (version: number) => void;
}) {
  const { open, onClose, projectId, initialFiles, specs, selectedVersion, onSelectVersion } = props;
  return (
    <aside
      className={[
        'w-full flex-col gap-3 overflow-y-auto md:w-[20%] md:shrink-0',
        open
          ? 'absolute inset-0 z-10 flex bg-surface p-3 md:static md:bg-transparent md:p-0'
          : 'hidden md:flex',
      ].join(' ')}
    >
      {open ? (
        <Button
          size="sm"
          variant="secondary"
          className="md:hidden"
          onClick={() => {
            onClose();
          }}
        >
          Закрыть
        </Button>
      ) : null}
      <FilePanel initialFiles={initialFiles} projectId={projectId} />
      <SpecificationPanel
        specs={specs}
        selectedVersion={selectedVersion}
        onSelectVersion={onSelectVersion}
      />
      <Card>
        <CardTitle>
          <Link href={`/projects/${projectId}/tasks`} className="block text-sm">
            Дорожная карта
          </Link>
        </CardTitle>
      </Card>
    </aside>
  );
}

export function PreviewColumn(props: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  preview: PreviewState;
  onApproved: (approvedAt: Date) => void;
}) {
  const { open, onClose, projectId, preview, onApproved } = props;
  return (
    <aside
      className={[
        'w-full md:w-[20%] md:shrink-0',
        open
          ? 'absolute inset-0 z-10 bg-surface p-3 md:static md:bg-transparent md:p-0'
          : 'hidden md:block',
      ].join(' ')}
    >
      {open ? (
        <Button
          size="sm"
          variant="secondary"
          className="mb-2 md:hidden"
          onClick={() => {
            onClose();
          }}
        >
          Закрыть
        </Button>
      ) : null}
      <div className="h-full min-h-0">
        <SpecPreviewPanel
          projectId={projectId}
          version={preview.version}
          content={preview.content}
          approvedAt={preview.approvedAt}
          loading={preview.loading}
          onApproved={onApproved}
        />
      </div>
    </aside>
  );
}
