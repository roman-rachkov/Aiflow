'use client';

/**
 * Custom assistant message renderer for `AgentInterface`.
 *
 * Replaces the default `AssistantMessageContainer` + `AssistantMessageContent`
 * to add a hover action bar (copy, regenerate) while preserving the OpenUI
 * layout classes (`openui-agent-thread-message-assistant*`) so the message
 * blends with the scroll-anchor and styling the shell already applies. The
 * markdown body uses the same `MarkDownRenderer` the default renderer does.
 *
 * Regenerate cancels any in-flight stream, removes the trailing assistant turn,
 * and re-sends the last user message via `processMessage` so a fresh reply is
 * streamed against the same history. Wired through the headless `useThread()`
 * store (available because the message renders inside `ChatProvider`).
 */

import { useCallback } from 'react';
import { useThread, type AssistantMessage } from '@openuidev/react-headless';
import { MarkDownRenderer } from '@openuidev/react-ui/MarkDownRenderer';

import { MessageActions, assistantActions } from './MessageActions';

export type AguiAssistantMessageProps = {
  message: AssistantMessage;
  isStreaming: boolean;
};

export function AguiAssistantMessage({ message, isStreaming }: AguiAssistantMessageProps) {
  const { messages, cancelMessage, processMessage } = useThread();

  const onRegenerate = useCallback(() => {
    // Find the user message immediately preceding this assistant turn. The
    // thread is chronological; the user turn sits before the assistant reply.
    const idx = messages.findIndex((m) => m.id === message.id);
    let userIdx = idx - 1;
    while (userIdx >= 0 && messages[userIdx].role !== 'user') userIdx -= 1;
    const userMsg = userIdx >= 0 ? messages[userIdx] : null;
    if (!userMsg || typeof userMsg.content !== 'string') return;

    cancelMessage();
    void processMessage({ role: 'user', content: userMsg.content });
  }, [messages, message.id, cancelMessage, processMessage]);

  const actions = isStreaming
    ? []
    : assistantActions({ content: message.content ?? '', onRegenerate });

  return (
    <div className="openui-agent-thread-message-assistant group relative">
      <div className="openui-agent-thread-message-assistant__content">
        {message.content ? (
          <MarkDownRenderer
            textMarkdown={message.content}
            className="openui-agent-thread-message-assistant__text"
          />
        ) : null}
        {actions.length > 0 ? (
          <div className="mt-1">
            <MessageActions actions={actions} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
