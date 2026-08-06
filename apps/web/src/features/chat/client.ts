/**
 * Client-only public surface of the chat slice.
 *
 * Next.js treats a barrel that re-exports any `'use client'` module as
 * contaminating every sibling export — server-only helpers (`listMessages`,
 * `readSystemPrompt`, fs/Prisma) then get pulled into the client graph and
 * blow up with `Object.defineProperty called on non-object`. Keep interactive
 * UI here; server API stays on `./index`.
 */
export { ChatPanel } from './ui/ChatPanel';
export type { ChatPanelProps } from './ui/ChatPanel';
