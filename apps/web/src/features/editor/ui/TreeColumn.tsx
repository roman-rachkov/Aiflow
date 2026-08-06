'use client';

import { Button, Spinner } from '@aiflow/ui';

import type { TreeNode } from '../model/types';
import { FileTree } from './FileTree';

type Props = {
  tree: TreeNode[];
  loading: boolean;
  error: string | null;
  activePath: string | null;
  dirtyPaths: Set<string>;
  onRetry: () => void;
  onOpen: (path: string) => void;
  onCreateFile: () => void;
  onCreateFolder: () => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
};

export function TreeColumn({
  tree,
  loading,
  error,
  activePath,
  dirtyPaths,
  onRetry,
  onOpen,
  onCreateFile,
  onCreateFolder,
  onRename,
  onDelete,
}: Props) {
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center border-r border-border">
        <Spinner label="Загрузка дерева…" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-full flex-col items-start gap-2 border-r border-border p-3 text-sm">
        <p role="alert" className="text-danger">
          {error}
        </p>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Повторить
        </Button>
      </div>
    );
  }
  return (
    <FileTree
      nodes={tree}
      activePath={activePath}
      dirtyPaths={dirtyPaths}
      onOpen={onOpen}
      onCreateFile={onCreateFile}
      onCreateFolder={onCreateFolder}
      onRename={onRename}
      onDelete={onDelete}
    />
  );
}
