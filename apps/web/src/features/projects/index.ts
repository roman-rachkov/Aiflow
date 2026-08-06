/**
 * Public surface of the projects feature slice. Everything outside this slice
 * (pages, API routes, other slices) imports from here. Cross-slice
 * feature→feature imports are blocked by `boundaries/dependencies` in
 * eslint.config.mjs (the policy uses `capture: slice` to require a matching
 * slice name for feature→feature, so this barrel is the only seam).
 */
export type { ProjectView } from './model/types';
export { createProject, getProject, listProjects, removeProject } from './model/service';
export type { CreateProjectInput } from './model/service';
export { resolveProjectSchema } from './model/access';
export { CreateProjectForm } from './ui/CreateProjectForm';
export { DeleteProjectButton } from './ui/DeleteProjectButton';
export { ProjectDetails } from './ui/ProjectDetails';
export { ProjectList } from './ui/ProjectList';
