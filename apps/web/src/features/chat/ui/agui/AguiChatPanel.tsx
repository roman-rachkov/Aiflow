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
 * slot, and thread management (rename/fork/delete) via a custom Sidebar
 * (`AguiThreadList` replacing the default ThreadList).
 */

import { AgentInterface } from '@openuidev/react-ui/AgentInterface';

import { AguiAssistantMessage } from './messages/AguiAssistantMessage';
import { AguiUserMessage } from './messages/AguiUserMessage';
import { ProjectIdContext } from './messages/project-context';
import { AguiThreadList } from './threads/AguiThreadList';
import { createProjectChatLLm } from './llm';
import { createThreadStorage } from './storage';
import { CHAT_LABELS, STARTERS } from './labels';

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
          starters={STARTERS}
        />
      </AgentInterface>
    </ProjectIdContext.Provider>
  );
}
