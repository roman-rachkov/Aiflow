'use client';

/**
 * Carries the active `projectId` down to the custom message components.
 *
 * The OpenUI `components.{AssistantMessage, UserMessage}` slot has a fixed
 * signature — `{ message, isStreaming? }` — so `projectId` cannot be passed as
 * a prop. The components render inside `ChatProvider`, so a React context is
 * the natural channel. `AguiChatPanel` provides the value; the message
 * components consume it to persist edits/deletes (they also need the active
 * `threadId`, which comes from `useThreadList().selectedThreadId`).
 */

import { createContext, useContext } from 'react';

export const ProjectIdContext = createContext<string>('');

export function useProjectId(): string {
  return useContext(ProjectIdContext);
}
