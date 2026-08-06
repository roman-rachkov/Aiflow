/**
 * Public surface of the deploy feature slice (Task 2.3).
 * UI lives in `./client` so this barrel stays server-safe.
 */

export type {
  CreateDeploymentResult,
  DeployContext,
  DeploymentDetail,
  DeploymentStatus,
  DeploymentSummary,
  ExportResult,
  RenderedTemplates,
} from './model/types';
export { DeployConflictError, DeployGiteaMissingError } from './model/types';
export { assertProDeploy, resolveDeployContext } from './model/access';
export type { ProApiUser } from './model/access';
export { renderDeployTemplates, deployImageName, shortProjectId } from './model/templates';
export { exportDeployTemplates } from './model/export';
export type { ExportOptions } from './model/export';
export { createDeployment, getDeployment, listDeployments } from './model/service';
export type { CreateDeploymentOptions } from './model/service';
