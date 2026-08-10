import { notFound } from 'next/navigation';

import { requireProMode, requireUser } from '@/features/auth';
import { ModelSettingsForm } from '@/features/model-config/client';
import { resolveProjectSchema } from '@/features/projects';

/** Pro-only Analyst ModelConfig settings (reached from shell, Pro-gated). */
export default async function ModelSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();
  const user = await requireProMode();
  const schemaName = await resolveProjectSchema(id, user.id);
  if (!schemaName) notFound();

  return <ModelSettingsForm projectId={id} />;
}
