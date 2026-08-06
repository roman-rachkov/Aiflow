/** Shared deploy types (Task 2.3). */

export type DeploymentStatus = 'BUILDING' | 'DEPLOYED' | 'FAILED';

export type DeploymentSummary = {
  id: string;
  status: DeploymentStatus;
  url: string | null;
  imageTag: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type DeploymentDetail = DeploymentSummary & {
  log: string | null;
};

export type DeployContext = {
  projectId: string;
  schemaName: string;
  giteaOwner: string;
  giteaRepo: string;
  giteaDefaultBranch: string;
};

export type RenderedTemplates = {
  dockerfile: string;
  compose: string;
  imageName: string;
};

export type ExportResult = RenderedTemplates & {
  committed: boolean;
  commitSha?: string;
};

export type CreateDeploymentResult = {
  deploymentId: string;
  status: 'BUILDING';
};

export class DeployConflictError extends Error {
  constructor(message = 'Сборка уже выполняется') {
    super(message);
    this.name = 'DeployConflictError';
  }
}

export class DeployGiteaMissingError extends Error {
  constructor(
    message = 'Репозиторий ещё не создан. Откройте редактор кода, чтобы подготовить Git.',
  ) {
    super(message);
    this.name = 'DeployGiteaMissingError';
  }
}
