/**
 * Russian localization for the AgentInterface chat surface.
 *
 * `starters` are clickable prompt pills shown on an empty thread
 * (`ConversationStarterProps`); `labels` covers the workspace/artifact rail
 * copy (`AgentInterfaceLabels`). Every field is optional; we override only what
 * a Russian end user sees. The welcome card is composed in `AguiChatPanel` via
 * `AgentInterface.Welcome`, so no welcome config object is needed here.
 */

import type { AgentInterfaceLabels } from '@openuidev/react-ui';
import type { ConversationStarterProps } from '@openuidev/react-ui';

export const STARTERS: ConversationStarterProps[] = [
  { displayText: 'Хочу сделать интернет-магазин', prompt: 'Хочу сделать интернет-магазин' },
  { displayText: 'Идея: блог про путешествия', prompt: 'Идея: блог про путешествия' },
  { displayText: 'Нужно приложение для задач', prompt: 'Нужно приложение для задач' },
];

/** Starter that prompts the Analyst to call the spec:generate tool. */
export const SPEC_STARTER: ConversationStarterProps = {
  displayText: 'Создать спецификацию',
  prompt: 'Создай спецификацию SPEC.md из нашего диалога',
};

export const CHAT_LABELS: AgentInterfaceLabels = {
  defaultCategory: 'Артефакты',
  workspaceToggle: 'Рабочая область чата',
  tabs: { all: 'Все', artifacts: 'Артефакты', apps: 'Приложения' },
};
