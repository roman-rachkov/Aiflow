/** Shared types for the Support Bot feature slice. */

/** Inbound chat request from client → API route. */
export interface SupportChatRequest {
  message: string;
}

/** SSE event payload: a streamed text delta from the bot. */
export interface SupportChatDelta {
  text: string;
}

/** SSE event payload: terminal event carrying done + optional sources. */
export interface SupportChatDone {
  done: true;
  sources: string[];
}
