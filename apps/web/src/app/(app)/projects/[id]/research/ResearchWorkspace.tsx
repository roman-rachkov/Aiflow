/**
 * ResearchWorkspace — client shell for the Researcher screen.
 *
 * Owns SPEC list / selection / preview state so Create (composer), left version
 * list, and right preview stay in sync. FilePanel keeps its own local state.
 * Layout: three columns on md+, drawers on small screens.
 */
'use client';

import Link from 'next/link';

import { Button } from '@aiflow/ui';

import type { ChatMessageView } from '@/features/chat';
import { ChatPanel } from '@/features/chat/client';
import type { FileListItemView } from '@/features/files';
import type { SpecificationListItemView } from '@/features/specifications';

import { ArtifactsColumn, PreviewColumn } from './research-columns';
import { useResearchSpecState } from './use-research-spec-state';

export type ResearchWorkspaceProps = {
  projectId: string;
  projectName: string;
  initialMessages: ChatMessageView[];
  initialFiles: FileListItemView[];
  initialSpecs: SpecificationListItemView[];
};

export function ResearchWorkspace(props: ResearchWorkspaceProps) {
  const { projectId, projectName, initialMessages, initialFiles, initialSpecs } = props;
  const state = useResearchSpecState(projectId, initialSpecs);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <WorkspaceHeader
        projectId={projectId}
        projectName={projectName}
        onToggleArtifacts={() => {
          state.setShowArtifacts((v) => !v);
        }}
        onTogglePreview={() => {
          state.setShowPreview((v) => !v);
        }}
      />
      <WorkspaceColumns
        projectId={projectId}
        initialMessages={initialMessages}
        initialFiles={initialFiles}
        state={state}
      />
    </div>
  );
}

type SpecState = ReturnType<typeof useResearchSpecState>;

function WorkspaceColumns(props: {
  projectId: string;
  initialMessages: ChatMessageView[];
  initialFiles: FileListItemView[];
  state: SpecState;
}) {
  const { projectId, initialMessages, initialFiles, state } = props;
  return (
    <div className="relative flex min-h-0 flex-1 gap-3">
      <ArtifactsColumn
        open={state.showArtifacts}
        onClose={() => {
          state.setShowArtifacts(false);
        }}
        projectId={projectId}
        initialFiles={initialFiles}
        specs={state.specs}
        selectedVersion={state.preview.version}
        onSelectVersion={state.selectVersion}
      />
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface md:w-[60%]">
        <ChatPanel
          initialMessages={initialMessages}
          projectId={projectId}
          onCreateSpec={state.createSpec}
          creatingSpec={state.creating}
          createSpecError={state.createError}
        />
      </section>
      <PreviewColumn
        open={state.showPreview}
        onClose={() => {
          state.setShowPreview(false);
        }}
        projectId={projectId}
        preview={state.preview}
        onApproved={state.onApproved}
      />
    </div>
  );
}

function WorkspaceHeader(props: {
  projectId: string;
  projectName: string;
  onToggleArtifacts: () => void;
  onTogglePreview: () => void;
}) {
  const { projectId, projectName, onToggleArtifacts, onTogglePreview } = props;
  return (
    <div className="flex shrink-0 items-center justify-between gap-2">
      <h1 className="truncate text-base font-semibold tracking-tight">{projectName}</h1>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" className="md:hidden" onClick={onToggleArtifacts}>
          Артефакты
        </Button>
        <Button size="sm" variant="secondary" className="md:hidden" onClick={onTogglePreview}>
          SPEC
        </Button>
        <Link
          href={`/projects/${projectId}`}
          className="text-sm text-fg-muted hover:text-fg hover:underline"
        >
          О проекте
        </Link>
      </div>
    </div>
  );
}
