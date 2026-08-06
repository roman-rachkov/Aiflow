'use client';

import type { TreeNode } from '../model/types';

type Props = {
  nodes: TreeNode[];
  activePath: string | null;
  dirtyPaths: Set<string>;
  onOpen: (path: string) => void;
  onCreateFile: () => void;
  onCreateFolder: () => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
};

/** Left-panel file tree with inline rename/delete actions. */
export function FileTree(props: Props) {
  return (
    <div className="flex h-full flex-col border-r border-border bg-surface text-sm">
      <TreeHeader onCreateFile={props.onCreateFile} onCreateFolder={props.onCreateFolder} />
      <ul className="flex-1 overflow-auto p-1">
        {props.nodes.length === 0 ? (
          <li className="px-2 py-3 text-fg-muted">Создайте файл</li>
        ) : (
          props.nodes.map((node) => (
            <TreeRow
              key={node.path}
              node={node}
              active={props.activePath === node.path}
              dirty={props.dirtyPaths.has(node.path)}
              onOpen={props.onOpen}
              onRename={props.onRename}
              onDelete={props.onDelete}
            />
          ))
        )}
      </ul>
    </div>
  );
}

function TreeHeader({
  onCreateFile,
  onCreateFolder,
}: {
  onCreateFile: () => void;
  onCreateFolder: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-1 border-b border-border px-2 py-1.5">
      <span className="font-medium text-fg">Файлы</span>
      <div className="flex gap-1">
        <button
          type="button"
          className="rounded px-1.5 text-fg-muted hover:bg-surface-muted hover:text-fg"
          title="Создать файл"
          onClick={onCreateFile}
        >
          +файл
        </button>
        <button
          type="button"
          className="rounded px-1.5 text-fg-muted hover:bg-surface-muted hover:text-fg"
          title="Создать папку"
          onClick={onCreateFolder}
        >
          +папка
        </button>
      </div>
    </div>
  );
}

function TreeRow({
  node,
  active,
  dirty,
  onOpen,
  onRename,
  onDelete,
}: {
  node: TreeNode;
  active: boolean;
  dirty: boolean;
  onOpen: (path: string) => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
}) {
  const indent = Math.max(0, node.path.split('/').length - 1);
  return (
    <li>
      <div
        className={`group flex items-center gap-1 rounded px-1 py-0.5 ${
          active ? 'bg-primary/10 text-primary' : 'hover:bg-surface-muted'
        }`}
        style={{ paddingLeft: `${String(4 + indent * 12)}px` }}
      >
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left"
          onClick={() => {
            if (node.type === 'file') onOpen(node.path);
          }}
        >
          {node.type === 'dir' ? '[dir] ' : ''}
          {node.name}
          {dirty ? ' •' : ''}
        </button>
        {node.type === 'file' ? (
          <RowActions path={node.path} onRename={onRename} onDelete={onDelete} />
        ) : null}
      </div>
    </li>
  );
}

function RowActions({
  path,
  onRename,
  onDelete,
}: {
  path: string;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
}) {
  return (
    <span className="hidden gap-1 group-hover:flex">
      <button
        type="button"
        className="text-xs text-fg-muted hover:text-fg"
        onClick={() => {
          onRename(path);
        }}
      >
        ✎
      </button>
      <button
        type="button"
        className="text-xs text-fg-muted hover:text-danger"
        onClick={() => {
          onDelete(path);
        }}
      >
        ×
      </button>
    </span>
  );
}
