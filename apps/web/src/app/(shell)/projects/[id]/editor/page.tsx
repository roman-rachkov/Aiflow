import { notFound } from 'next/navigation';

import { requireProMode, requireUser } from '@/features/auth';
import { resolveEditorContext } from '@/features/editor';
import { EditorPageClient } from './EditorPageClient';

/**
 * Pro code editor (separate page, not a shell Route — Monaco + WS stay on a
 * dedicated route to avoid container/resize risks inside the chat shell).
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
