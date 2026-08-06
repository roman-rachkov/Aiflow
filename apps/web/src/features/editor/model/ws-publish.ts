/**
 * Helpers for REST routes to emit editor WS events after successful mutations.
 */
import { publishEditorEvent } from './ws-hub';

/** Notify open editor tabs that files were saved (one event per path). */
export function publishSaved(
  projectId: string,
  userId: string,
  commitSha: string,
  files: string[],
): void {
  for (const path of files) {
    publishEditorEvent(projectId, userId, { type: 'editor.saved', path, commitSha });
  }
  publishEditorEvent(projectId, userId, { type: 'editor.treeChanged' });
}

/** Notify open editor tabs that the file tree changed (create/delete/rename). */
export function publishTreeChanged(projectId: string, userId: string): void {
  publishEditorEvent(projectId, userId, { type: 'editor.treeChanged' });
}
