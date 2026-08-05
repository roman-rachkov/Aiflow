/**
 * Public surface of the projects feature slice. Everything outside this slice
 * (pages, API routes, other slices) imports from here — deep paths are
 * rejected by `import/no-internal-modules`, and cross-slice feature→feature
 * imports are blocked by `boundaries/dependencies` (eslint.config.mjs).
 */
export type { ProjectView } from './model/types';
export { createProject, getProject, listProjects, removeProject } from './model/service';
export type { CreateProjectInput } from './model/service';
export { CreateProjectForm } from './ui/CreateProjectForm';
export { DeleteProjectButton } from './ui/DeleteProjectButton';
export { ProjectDetails } from './ui/ProjectDetails';
export { ProjectList } from './ui/ProjectList';
