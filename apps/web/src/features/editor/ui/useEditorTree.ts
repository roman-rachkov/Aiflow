'use client';

import { useCallback, useEffect, useState } from 'react';

import type { TreeNode } from '../model/types';
import { fetchTree } from './api';

/** Load and reload the Gitea file tree for the editor sidebar. */
export function useEditorTree(projectId: string) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [treeLoading, setTreeLoading] = useState(true);

  const reloadTree = useCallback(async () => {
    setTreeLoading(true);
    setTreeError(null);
    try {
      setTree(await fetchTree(projectId));
    } catch (err) {
      setTreeError(err instanceof Error ? err.message : 'Не удалось загрузить дерево');
    } finally {
      setTreeLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void reloadTree();
  }, [reloadTree]);

  return { tree, treeLoading, treeError, reloadTree };
}
