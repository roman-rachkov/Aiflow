/**
 * ChatPanel — the Analyst chat surface.
 *
 * A client component wrapping @assistant-ui/react's runtime + primitives. The
 * spike (task 1) adopted assistant-ui rather than rolling a custom list, so
 * this composes the library's ThreadPrimitive / MessagePrimitive /
 * ComposerPrimitive — v0.15.4 ships only headless primitives (no bundled
 * `<Thread/>`), so a thin styled shell is unavoidable. The shell encodes only
 * styling and Russian copy; all message/stream/input state is delegated.
 *
 * Russian user-facing strings live here (empty state, placeholder, the
 * "Аналитик печатает…" indicator). The component is server-renderable as a
 * placeholder; the 'use client' boundary is required because the runtime hooks
 * into React state and the fetch happens in the browser.
 */
'use client';

import {
  AssistantRuntimeProvider,
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useLocalRuntime,
  type ThreadMessageLike,
} from '@assistant-ui/react';
import { useMemo } from 'react';

import type { ChatMessageView } from '@/features/chat/model/types';

import { createResearcherAdapter } from './researcher-runtime';

export type ChatPanelProps = {
  /** Preloaded history (server-rendered). Empty for a fresh thread. */
  initialMessages: ChatMessageView[];
  /** Project id — routes each turn to /api/projects/{id}/chat. */
  projectId: string;
};

/**
 * Map the persisted view onto assistant-ui's ThreadMessageLike. The view's
 * role union is uppercase ('USER'/'ASSISTANT'); the runtime's is lowercase.
 */
function toThreadMessage(view: ChatMessageView): ThreadMessageLike {
  const role = view.role === 'USER' ? 'user' : view.role === 'ASSISTANT' ? 'assistant' : 'system';
  return { role, content: [{ type: 'text', text: view.content }], id: view.id };
}

export function ChatPanel({ initialMessages, projectId }: ChatPanelProps) {
  const adapter = useMemo(() => createResearcherAdapter(projectId), [projectId]);
  const runtimeOptions = useMemo(
    () => ({ initialMessages: initialMessages.map(toThreadMessage) }),
    [initialMessages],
  );
  const runtime = useLocalRuntime(adapter, runtimeOptions);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="flex h-full flex-col">
        <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-4 py-6">
          <AuiIf condition={(s) => s.thread.isEmpty}>
            <p className="py-12 text-center text-sm text-fg-muted">
              Спросите аналитика о данных проекта.
            </p>
          </AuiIf>
          <ThreadPrimitive.Messages>{renderMessage}</ThreadPrimitive.Messages>
        </ThreadPrimitive.Viewport>
        <AuiIf condition={(s) => s.thread.isRunning}>
          <p className="px-4 py-2 text-xs text-fg-muted">Аналитик печатает…</p>
        </AuiIf>
        <Composer />
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}

/** Per-message renderer: branch on role. */
function renderMessage({ message }: { message: { role: 'user' | 'assistant' | 'system' } }) {
  return message.role === 'user' ? <UserMessage /> : <AssistantMessage />;
}

/** Read-only bubble for the user's own turn. */
function UserMessage() {
  return (
    <MessagePrimitive.Root className="mb-4 flex justify-end">
      <div className="max-w-[80%] rounded-lg bg-primary px-3 py-2 text-sm text-white">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
}

/** Assistant turn. Streaming content renders through MessagePrimitive.Parts. */
function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="mb-4 flex justify-start">
      <div className="max-w-[80%] rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg">
        <MessagePrimitive.Parts />
        <MessagePrimitive.Error>
          <span className="text-danger">Не удалось получить ответ.</span>
        </MessagePrimitive.Error>
      </div>
    </MessagePrimitive.Root>
  );
}

/**
 * Input row. The library wires Enter-to-send and disables the send button while
 * a run is in flight; the composer's form submission is what triggers the next
 * turn, so no manual onClick handler is needed.
 */
function Composer() {
  return (
    <ComposerPrimitive.Root className="flex items-center gap-2 border-t border-border px-4 py-3">
      <ComposerPrimitive.Input
        placeholder="Сообщение аналитику…"
        className="flex-1 resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-primary"
      />
      <ComposerPrimitive.Send className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50">
        Отправить
      </ComposerPrimitive.Send>
    </ComposerPrimitive.Root>
  );
}
