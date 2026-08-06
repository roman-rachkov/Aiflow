import { notFound } from 'next/navigation';

import { requireProMode, requireUser } from '@/features/auth';
import { resolveEditorContext } from '@/features/editor';
import { EditorPageClient } from './EditorPageClient';

/**
 * Pro code editor. Wiring only: auth + ownership; UI from `@/features/editor`.
 * BASIC users are redirected by `requireProMode`.
 */
export default async function ProjectEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();
  const user = await requireProMode();
  const ctx = await resolveEditorContext(id, user.id);
  if (!ctx) notFound();

  return <EditorPageClient projectId={id} />;
}
