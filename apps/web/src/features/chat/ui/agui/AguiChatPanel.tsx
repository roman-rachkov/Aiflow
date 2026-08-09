'use client';

/**
 * Grown-up chat surface for one project, built on the OpenUI `AgentInterface`.
 *
 * Replaces the legacy `@assistant-ui`-based `ChatPanel`. `AgentInterface` is
 * itself a `ChatProvider` (its props extend `ChatProviderProps`), so we pass our
 * REST thread storage (`createThreadStorage`) and the AG-UI streaming `ChatLLM`
 * (`createProjectChatLLm`) straight to it. The AgentInterface owns the heavy
 * surface — markdown + code rendering, conversation starters, stop — and we
 * layer: per-message actions (copy/edit/regenerate/delete) via the `components`
 * slot, thread management (rename/fork/delete) via a custom Sidebar, and SPEC
 * artifacts via `artifactRenderers` (the tool-call path).
 */

import { AgentInterface } from '@openuidev/react-ui/AgentInterface';

import { specArtifactRenderer } from '@/shared/spec-artifact-renderer';
import { ProjectIdContext } from '@/shared/chat-project-context';

import { AguiAssistantMessage } from './messages/AguiAssistantMessage';
import { AguiUserMessage } from './messages/AguiUserMessage';
import { AguiThreadList } from './threads/AguiThreadList';
import { createProjectChatLLm } from './llm';
import { createThreadStorage } from './storage';
import { CHAT_LABELS, STARTERS, SPEC_STARTER } from './labels';

/** Module-level: artifact renderers are captured once at ChatProvider mount. */
const ARTIFACT_RENDERERS = [specArtifactRenderer];

export type AguiChatPanelProps = {
  projectId: string;
};

export function AguiChatPanel({ projectId }: AguiChatPanelProps) {
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
      >
        <AgentInterface.Sidebar>
          <AgentInterface.SidebarHeader agentName="Аналитик" />
          <AgentInterface.SidebarContent>
            <AgentInterface.NewChatButton />
            <AguiThreadList />
          </AgentInterface.SidebarContent>
        </AgentInterface.Sidebar>
        <AgentInterface.Welcome
          title="Опишите идею проекта"
          description="Я — Аналитик. Задаю уточняющие вопросы, помогаю оформить идею в спецификацию SPEC.md, запускаю планировщик и кодогенерацию."
          starters={[SPEC_STARTER, ...STARTERS]}
        />
      </AgentInterface>
    </ProjectIdContext.Provider>
  );
}
