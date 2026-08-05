import { requireUser } from '@/features/auth';
import { ProjectList, listProjects } from '@/features/projects';

/**
 * The dashboard project list. A server component: it runs the auth guard and
 * fetches the projects here, then hands them to the (server) `ProjectList`.
 * `app/` is routing only — all logic lives in the feature slices.
 */
export default async function ProjectsPage() {
  const user = await requireUser();
  const projects = await listProjects(user.id);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Проекты</h1>
      <div className="mt-6">
        <ProjectList projects={projects} />
      </div>
    </>
  );
}
