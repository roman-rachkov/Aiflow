/**
 * Public surface of the chat feature slice. Everything outside this slice
 * (pages, API routes, other slices) imports from here. Cross-slice
 * feature→feature imports are blocked by `boundaries/dependencies` in
 * eslint.config.mjs (the policy uses `capture: slice` to require a matching
 * slice name for feature→feature, so this barrel is the only seam).
 */
export type { ChatMessageView, SaveMessageInput } from './model/types';
export { listMessages, saveMessage } from './model/service';
export { readSystemPrompt } from './model/schema';
export { ChatPanel } from './ui/ChatPanel';
