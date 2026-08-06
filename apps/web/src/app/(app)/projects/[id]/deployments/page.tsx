import { requireUser } from '@/features/auth';
import { DeploymentsPanel } from '@/features/deploy/client';
import { resolveProjectSchema } from '@/features/projects';
import { notFound } from 'next/navigation';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ highlight?: string }>;
};

/**
 * Deployment history — owner BASIC+PRO; Build button only for Pro.
 */
export default async function DeploymentsPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { highlight } = await searchParams;
  const user = await requireUser();
  const schema = await resolveProjectSchema(id, user.id);
  if (!schema) notFound();

  return (
    <DeploymentsPanel
      projectId={id}
      canBuild={user.uiMode === 'PRO'}
      highlightId={highlight ?? null}
    />
  );
}
