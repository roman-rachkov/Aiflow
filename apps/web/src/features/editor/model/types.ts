/**
 * Editor domain types. Gitea identity is always filled on `EditorContext` —
 * `resolveEditorContext` lazy-provisions when ProjectMeta still has nulls.
 */

/** Resolved project + Gitea identity for editor services and routes. */
export type EditorContext = {
  id: string;
  name: string;
  schemaName: string;
  ownerId: string;
  giteaOwner: string;
  giteaRepo: string;
  giteaDefaultBranch: string;
};

/**
 * Minimal session shape for the API Pro gate. Avoids importing `@/features/auth`
 * (FSD forbids feature→feature). Routes pass the user from `requireUser()`.
 */
export type ProApiUser = {
  uiMode: 'BASIC' | 'PRO';
};

/** Gitea repo identity written back onto ProjectMeta after provision. */
export type GiteaRepoIdentity = {
  owner: string;
  repo: string;
  defaultBranch: string;
};
