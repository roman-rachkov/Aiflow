'use client';

/**
 * Grown-up chat surface for one project, built on the OpenUI `AgentInterface`.
 *
 * Replaces the legacy `@assistant-ui`-based `ChatPanel`. `AgentInterface` is
 * itself a `ChatProvider` (its props extend `ChatProviderProps`), so we pass our
 * REST thread storage (`createThreadStorage`) and the AG-UI streaming `ChatLLM`
 * (`createProjectChatLLm`) straight to it. The AgentInterface then owns the
 * heavy surface — thread list, message actions (copy/edit/delete/regenerate/
 * stop), markdown + code rendering, conversation starters — and we only supply
 * the backend bridges, the Russian welcome, and Russian labels.
 */

import { AgentInterface } from '@openuidev/react-ui/AgentInterface';

import { createProjectChatLLm } from './llm';
import { createThreadStorage } from './storage';
import { CHAT_LABELS, STARTERS } from './labels';

export type AguiChatPanelProps = {
  projectId: string;
};

export function AguiChatPanel({ projectId }: AguiChatPanelProps) {
  return (
    <AgentInterface
      logoUrl="/logo.svg"
      agentName="Аналитик"
      labels={CHAT_LABELS}
      starters={STARTERS}
      scrollVariant="always"
      storage={{ thread: createThreadStorage(projectId) }}
      llm={createProjectChatLLm(projectId)}
    >
      <AgentInterface.Welcome
        title="Опишите идею проекта"
        description="Я — Аналитик. Задаю уточняющие вопросы, помогаю оформить идею в спецификацию SPEC.md, запускаю планировщик и кодогенерацию."
        starters={STARTERS}
      />
    </AgentInterface>
  );
}
