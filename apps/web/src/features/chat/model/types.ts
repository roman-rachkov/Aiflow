/**
 * Chat thread + message data as the UI and API surface it. Deliberate subsets
 * of the `ChatThread` / `ChatMessage` rows: `tokensIn` / `tokensOut` are
 * best-effort provider counts the UI never renders, so they never cross the
 * service boundary — only the route handler persists them. `deletedAt` is not
 * part of either view; soft-deletes are filtered in the service layer, not
 * leaked through the DTO.
 *
 * Threads back the OpenUI AgentInterface ThreadList (list/create/switch/delete).
 * `parentId` on a message records the predecessor of an edited/regenerated
 * message so the full version tree is recoverable without losing prior content.
 */

/** One conversation thread. Maps onto `AgentInterface.ThreadList`. */
export interface ChatThreadView {
  id: string;
  title: string;
  /** Thread this one was forked from, or null for an original. */
  forkedFromId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Chat message as the UI and API surface it. Carries thread membership and an
 * optional parent (version-tree link for edit/regenerate) so the grown-up chat
 * UI can reconstruct lineage.
 */
export interface ChatMessageView {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  /** Thread the message belongs to. Null only for legacy pre-thread rows. */
  threadId: string | null;
  /** Predecessor of an edited/regenerated message, or null on originals. */
  parentId: string | null;
  createdAt: Date;
}

/**
 * Input for persisting a chat message. `role` is restricted to `USER` /
 * `ASSISTANT`: `SYSTEM` is not user-savable in MVP-0 (the system prompt is
 * read from `.claude/agents/analyst.md`, never persisted as a row). The token
 * counts are nullable for the same reason the column is — a streaming mock or
 * a dropped connection leaves them absent, and NULL is an honest "we don't
 * know", not a zero.
 */
export interface SaveMessageInput {
  role: 'USER' | 'ASSISTANT';
  content: string;
  threadId?: string;
  parentId?: string;
  tokensIn?: number | null;
  tokensOut?: number | null;
}

/** Input for creating a thread. Title defaults to "Новый чат" server-side. */
export interface CreateThreadInput {
  title?: string;
  /** Fork source — set when branching an existing thread. */
  forkedFromId?: string;
}

/** Input for renaming a thread (the only mutable field besides soft-delete). */
export interface UpdateThreadInput {
  title?: string;
}
