import { notFound } from 'next/navigation';

import { requireUser } from '@/features/auth';
import { getProject } from '@/features/projects';

import { AguiChatPanel } from '@/features/chat/ui/agui/AguiChatPanel';

/**
 * Preview route for the grown-up AgentInterface chat. Mounts the full chat
 * surface (thread list + message actions + AG-UI streaming) so the Phase 1 chat
 * overhaul can be verified in the browser before the shell rework (Phase 4)
 * folds this into the project home.
 */
export default async function ChatPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProject(id, user.id);

  if (!project) notFound();

  return (
    <div className="h-[calc(100vh-3.5rem)] w-full">
      <AguiChatPanel projectId={id} />
    </div>
  );
}
