/**
 * Client-safe exports for the OpenUI AgentInterface shell (ProjectShell).
 * AG-UI wiring stays behind this barrel so `app/` never deep-imports slice internals.
 */

export { AguiAssistantMessage } from './ui/agui/messages/AguiAssistantMessage';
export { AguiUserMessage } from './ui/agui/messages/AguiUserMessage';
export { AguiThreadList } from './ui/agui/threads/AguiThreadList';
export { createProjectChatLLm } from './ui/agui/llm';
export { createThreadStorage } from './ui/agui/storage';
export { CHAT_LABELS, COMPOSER_PLACEHOLDER, STARTERS, SPEC_STARTER } from './ui/agui/labels';
