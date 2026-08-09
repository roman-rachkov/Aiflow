'use client';

/**
 * Custom user message renderer for `AgentInterface`.
 *
 * Replaces the default `UserMessageContainer` + `UserMessageContent` to add a
 * hover action bar (edit, delete). Preserves the OpenUI layout class
 * (`openui-agent-thread-message-user`) so the shell's scroll-anchor and
 * styling stay consistent.
 *
 * Edit toggles an inline `MessageEditor`; on save, `updateMessage` writes the
 * new content in place. Delete calls `deleteMessage` (the headless store + our
 * backend soft-delete the row). Wired through the headless `useThread()` store.
 */

import { useCallback, useState } from 'react';
import { useThread, useThreadList, type UserMessage } from '@openuidev/react-headless';

import { editMessage, removeMessage } from './api';
import { MessageActions, userActions } from './MessageActions';
import { MessageEditor } from './MessageEditor';
import { useProjectId } from './project-context';

export type AguiUserMessageProps = {
  message: UserMessage;
};

export function AguiUserMessage({ message }: AguiUserMessageProps) {
  const { updateMessage, deleteMessage, isRunning } = useThread();
  const selectedThreadId = useThreadList((s) => s.selectedThreadId);
  const projectId = useProjectId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => textOf(message.content));

  const startEdit = useCallback(() => {
    setDraft(textOf(message.content));
    setEditing(true);
  }, [message.content]);

  const saveEdit = useCallback(() => {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed && trimmed !== textOf(message.content) && selectedThreadId) {
      // Optimistic in-memory update + REST persistence for reload survival.
      updateMessage({ ...message, content: trimmed });
      void editMessage(projectId, selectedThreadId, message.id, trimmed);
    }
  }, [draft, message, updateMessage, selectedThreadId, projectId]);

  const onDelete = useCallback(() => {
    deleteMessage(message.id);
    if (selectedThreadId) {
      void removeMessage(projectId, selectedThreadId, message.id);
    }
  }, [deleteMessage, message.id, selectedThreadId, projectId]);

  // No actions while the assistant is generating (avoid racing a running turn).
  const actions = isRunning ? [] : userActions({ onEdit: startEdit, onDelete });

  return (
    <div className="openui-agent-thread-message-user group relative">
      <div className="openui-agent-thread-message-user__content">
        {editing ? (
          <MessageEditor
            value={draft}
            onChange={setDraft}
            onSave={saveEdit}
            onCancel={() => {
              setEditing(false);
            }}
          />
        ) : (
          <div className="whitespace-pre-wrap">{textOf(message.content)}</div>
        )}
        {!editing && actions.length > 0 ? (
          <div className="mt-1">
            <MessageActions actions={actions} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** AG-UI user content can be a string or a structured array; we persist string only. */
function textOf(content: UserMessage['content']): string {
  return typeof content === 'string' ? content : '';
}
