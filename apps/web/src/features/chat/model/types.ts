/**
 * Chat message data as the UI and API surface it. A deliberate subset of the
 * `ChatMessage` row: `tokensIn` / `tokensOut` are best-effort provider counts
 * that the UI never renders, so they never cross the service boundary here —
 * only the route handler persists them. `deletedAt` is not part of the view
 * either; soft-deletes are filtered in the service layer, not leaked through
 * the DTO.
 */
export interface ChatMessageView {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
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
  tokensIn?: number | null;
  tokensOut?: number | null;
}
