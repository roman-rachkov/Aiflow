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
 * «Создать спецификацию» lives above the composer (docs/09 §4); generation is
 * owned by the parent ResearchWorkspace via props.
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

import { Button, Spinner } from '@aiflow/ui';

import type { ChatMessageView } from '@/features/chat/model/types';

import { createResearcherAdapter } from './researcher-runtime';

export type ChatPanelProps = {
  /** Preloaded history (server-rendered). Empty for a fresh thread. */
  initialMessages: ChatMessageView[];
  /** Project id — routes each turn to /api/projects/{id}/chat. */
  projectId: string;
  /** Generate SPEC.md from the dialogue (parent owns the fetch). */
  onCreateSpec?: () => void;
  creatingSpec?: boolean;
  createSpecError?: string | null;
};

function toThreadMessage(view: ChatMessageView): ThreadMessageLike {
  const role = view.role === 'USER' ? 'user' : view.role === 'ASSISTANT' ? 'assistant' : 'system';
  return { role, content: [{ type: 'text', text: view.content }], id: view.id };
}

export function ChatPanel({
  initialMessages,
  projectId,
  onCreateSpec,
  creatingSpec = false,
  createSpecError = null,
}: ChatPanelProps) {
  const adapter = useMemo(() => createResearcherAdapter(projectId), [projectId]);
  const runtimeOptions = useMemo(
    () => ({ initialMessages: initialMessages.map(toThreadMessage) }),
    [initialMessages],
  );
  const runtime = useLocalRuntime(adapter, runtimeOptions);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="flex h-full min-h-0 flex-col">
        <ThreadPrimitive.Viewport className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <AuiIf condition={(s) => s.thread.isEmpty}>
            <p className="py-12 text-center text-sm text-fg-muted">
              Опишите идею проекта — аналитик задаст уточняющие вопросы.
            </p>
          </AuiIf>
          <ThreadPrimitive.Messages>{renderMessage}</ThreadPrimitive.Messages>
        </ThreadPrimitive.Viewport>
        <AuiIf condition={(s) => s.thread.isRunning}>
          <p className="shrink-0 px-4 py-1.5 text-xs text-fg-muted">Аналитик печатает…</p>
        </AuiIf>
        {createSpecError ? (
          <p className="shrink-0 px-4 text-xs text-danger">{createSpecError}</p>
        ) : null}
        {onCreateSpec ? (
          <div className="flex shrink-0 items-center gap-2 border-t border-border px-4 pt-2">
            <Button size="sm" disabled={creatingSpec} onClick={onCreateSpec}>
              {creatingSpec ? <Spinner size="sm" label={null} /> : null}
              Создать спецификацию
            </Button>
          </div>
        ) : null}
        <Composer />
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}

function renderMessage({ message }: { message: { role: 'user' | 'assistant' | 'system' } }) {
  return message.role === 'user' ? <UserMessage /> : <AssistantMessage />;
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="mb-4 flex justify-end">
      <div className="max-w-[80%] rounded-lg bg-primary px-3 py-2 text-sm text-white">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
}

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

function Composer() {
  return (
    <ComposerPrimitive.Root className="flex shrink-0 items-end gap-2 border-t border-border px-4 py-3">
      <ComposerPrimitive.Input
        placeholder="Сообщение аналитику…"
        rows={1}
        className="max-h-32 min-h-10 flex-1 resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg outline-hidden focus:border-primary"
      />
      <ComposerPrimitive.Send className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50">
        Отправить
      </ComposerPrimitive.Send>
    </ComposerPrimitive.Root>
  );
}
