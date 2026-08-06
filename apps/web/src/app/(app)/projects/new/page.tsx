import { requireUser } from '@/features/auth';
import { CreateProjectForm } from '@/features/projects/client';

/**
 * New-project page. The page is a thin server wrapper around the (client)
 * `CreateProjectForm`; the guard runs here so an anonymous visitor is sent to
 * sign-in before any client JS loads.
 */
export default async function NewProjectPage() {
  await requireUser();

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Новый проект</h1>
      <div className="mt-6">
        <CreateProjectForm />
      </div>
    </>
  );
}
