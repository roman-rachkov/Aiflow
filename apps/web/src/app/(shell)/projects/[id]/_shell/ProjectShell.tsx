'use client';

/**
 * Project home shell — the grown-up chat (`AgentInterface`) IS the project's app
 * shell. Combines: chat (default view, path=undefined), thread sidebar
 * (`AguiThreadList`), tool navigation (`SidebarNav`), and `Route` panels for
 * Files/Tasks/Deploy/SPEC/Models (`ProjectRoutes`). Editor opens as a separate
 * page (Monaco + WS stay out of the shell).
 *
 * Navigation is controlled (`path`/`onNavigate`): a SidebarItem with `path`
 * sets it; selecting a thread returns to `undefined` (chat). Pro-only items
 * (Editor, Models) are hidden for BASIC.
 */

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AgentInterface } from '@openuidev/react-ui/AgentInterface';

import { specArtifactRenderer } from '@/shared/spec-artifact-renderer';
import { ProjectIdContext } from '@/shared/chat-project-context';
import type { FileListItemView } from '@/features/files';
import type { SpecificationListItemView } from '@/features/specifications';
import { AguiAssistantMessage } from '@/features/chat/ui/agui/messages/AguiAssistantMessage';
import { AguiUserMessage } from '@/features/chat/ui/agui/messages/AguiUserMessage';
import { AguiThreadList } from '@/features/chat/ui/agui/threads/AguiThreadList';
import { createProjectChatLLm } from '@/features/chat/ui/agui/llm';
import { createThreadStorage } from '@/features/chat/ui/agui/storage';
import { CHAT_LABELS, STARTERS, SPEC_STARTER } from '@/features/chat/ui/agui/labels';

import { ProjectRoutes } from './ProjectRoutes';
import { SidebarNav } from './SidebarNav';

const ARTIFACT_RENDERERS = [specArtifactRenderer];

export type ProjectShellProps = {
  projectId: string;
  projectName: string;
  isPro: boolean;
  initialFiles: FileListItemView[];
  initialSpecs: SpecificationListItemView[];
};

export function ProjectShell(props: ProjectShellProps) {
  const { projectId, projectName, isPro, initialFiles, initialSpecs } = props;
  const router = useRouter();
  // Controlled shell navigation: undefined = chat view; a route path = panel.
  const [path, setPath] = useState<string | undefined>(undefined);

  const onOpenEditor = useCallback(() => {
    router.push(`/projects/${projectId}/editor`);
  }, [router, projectId]);

  return (
    <ProjectIdContext.Provider value={projectId}>
      <AgentInterface
        logoUrl="/logo.svg"
        agentName="Аналитик"
        labels={CHAT_LABELS}
        starters={STARTERS}
        scrollVariant="always"
        storage={{ thread: createThreadStorage(projectId) }}
        llm={createProjectChatLLm(projectId)}
        components={{ AssistantMessage: AguiAssistantMessage, UserMessage: AguiUserMessage }}
        artifactRenderers={ARTIFACT_RENDERERS}
        path={path}
        onNavigate={setPath}
      >
        <AgentInterface.Sidebar>
          <AgentInterface.SidebarHeader agentName={projectName} />
          <AgentInterface.SidebarContent>
            <AgentInterface.NewChatButton />
            <AguiThreadList />
            <SidebarNav isPro={isPro} onOpenEditor={onOpenEditor} />
          </AgentInterface.SidebarContent>
        </AgentInterface.Sidebar>
        <ProjectRoutes
          projectId={projectId}
          projectName={projectName}
          isPro={isPro}
          initialFiles={initialFiles}
          initialSpecs={initialSpecs}
        />
        <AgentInterface.Welcome
          title="Опишите идею проекта"
          description="Я — Аналитик. Задаю уточняющие вопросы, помогаю оформить идею в спецификацию SPEC.md, запускаю планировщик и кодогенерацию."
          starters={[SPEC_STARTER, ...STARTERS]}
        />
      </AgentInterface>
    </ProjectIdContext.Provider>
  );
}
