'use client';

import { type ReactNode } from 'react';

import { Button } from '@aiflow/ui';

import { CenterColumn } from './CenterColumn';
import { DialogHost } from './DialogHost';
import { GitPanel } from './GitPanel';
import { TerminalStub } from './TerminalStub';
import { TreeColumn } from './TreeColumn';
import { useEditorState } from './useEditorState';

type Props = {
  projectId: string;
  onBuild: () => void;
};

/**
 * Pro editor shell: file tree, Monaco, Save/Build, Git panel, terminal stub.
 * REST is source of truth; WS carries dirty/saved/treeChanged/terminal signals.
 */
export function EditorShell({ projectId, onBuild }: Props) {
  const s = useEditorState(projectId);
  return (
    <ShellLayout
      sidebarOpen={s.sidebarOpen}
      onToggleSidebar={() => {
        s.setSidebarOpen((v) => !v);
      }}
      tree={<EditorTree s={s} />}
      center={<EditorCenter s={s} onBuild={onBuild} />}
      git={
        <GitPanel
          projectId={projectId}
          open={s.gitOpen}
          onClose={() => {
            s.setGitOpen(false);
          }}
          refreshKey={s.gitKey}
        />
      }
      terminal={
        <TerminalStub
          open={s.termOpen}
          onToggle={() => {
            s.setTermOpen((v) => !v);
          }}
          ready={s.termReady}
          chunks={s.termChunks}
        />
      }
      dialog={<EditorDialogs s={s} />}
    />
  );
}

type State = ReturnType<typeof useEditorState>;

function EditorTree({ s }: { s: State }) {
  return (
    <TreeColumn
      tree={s.tree}
      loading={s.treeLoading}
      error={s.treeError}
      activePath={s.activePath}
      dirtyPaths={s.dirtyPaths}
      onRetry={() => {
        void s.reloadTree();
      }}
      onOpen={(path) => {
        void s.openPath(path);
      }}
      onCreateFile={() => {
        s.setDialog({ kind: 'create', isDir: false });
      }}
      onCreateFolder={() => {
        s.setDialog({ kind: 'create', isDir: true });
      }}
      onRename={(path) => {
        s.setDialog({ kind: 'rename', path });
      }}
      onDelete={(path) => {
        s.setDialog({ kind: 'delete', path });
      }}
    />
  );
}

function EditorCenter({ s, onBuild }: { s: State; onBuild: () => void }) {
  return (
    <CenterColumn
      openFiles={s.openFiles}
      activePath={s.activePath}
      dirtyPaths={s.dirtyPaths}
      saving={s.saving}
      toast={s.toast}
      onSelect={s.setActivePath}
      onCloseTab={s.closeTab}
      onChange={s.editContent}
      onSave={() => {
        void s.save();
      }}
      onBuild={onBuild}
      onToggleGit={() => {
        s.setGitOpen((v) => !v);
      }}
      onDismissToast={() => {
        s.setToast(null);
      }}
    />
  );
}

function EditorDialogs({ s }: { s: State }) {
  if (!s.dialog) return null;
  return (
    <DialogHost
      dialog={s.dialog}
      pending={s.dialogPending}
      error={s.dialogError}
      onClose={() => {
        s.setDialog(null);
        s.setDialogError(null);
      }}
      onAction={(value) => {
        void s.runDialog(value);
      }}
    />
  );
}

function ShellLayout(props: {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  tree: ReactNode;
  center: ReactNode;
  git: ReactNode;
  terminal: ReactNode;
  dialog: ReactNode;
}) {
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-surface-muted">
      <div className="flex items-center gap-2 border-b border-border bg-surface px-2 py-1 lg:hidden">
        <Button variant="ghost" size="sm" onClick={props.onToggleSidebar}>
          {props.sidebarOpen ? 'Скрыть файлы' : 'Файлы'}
        </Button>
      </div>
      <div className="flex min-h-0 flex-1">
        <div
          className={`${props.sidebarOpen ? 'flex' : 'hidden'} w-56 shrink-0 flex-col lg:flex xl:w-64`}
        >
          {props.tree}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">{props.center}</div>
        {props.git}
      </div>
      {props.terminal}
      {props.dialog}
    </div>
  );
}
