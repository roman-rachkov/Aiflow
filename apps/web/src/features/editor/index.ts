/**
 * Public surface of the editor feature slice. Everything outside this slice
 * (pages, API routes) imports from here. Cross-slice feature→feature imports
 * are blocked by `boundaries/dependencies` — this barrel is the only seam.
 *
 * Pro gate reminder: pages → `requireProMode` (redirect); API/WS →
 * `assertProApiUser` (403 JSON) / WS close **4403**. Never redirect from API.
 */
export type { EditorContext, GiteaRepoIdentity, ProApiUser } from './model/types';
export { assertProApiUser, isBinaryContent, resolveEditorContext } from './model/access';
export {
  ensureGiteaProvisioned,
  giteaRepoNameFromProjectId,
  provisionGiteaRepo,
  resolveGiteaOwner,
} from './model/provision';
