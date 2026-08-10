/**
 * Public surface of the chat feature slice. Everything outside this slice
 * (pages, API routes, other slices) imports from here. Cross-slice
 * feature→feature imports are blocked by `boundaries/dependencies` in
 * eslint.config.mjs (the policy uses `capture: slice` to require a matching
 * slice name for feature→feature, so this barrel is the only seam).
 */
export type {
  ChatMessageView,
  ChatThreadView,
  CreateThreadInput,
  SaveMessageInput,
  UpdateThreadInput,
} from './model/types';
export {
  deleteMessage,
  listMessages,
  listMessagesByThread,
  saveMessage,
  updateMessageContent,
} from './model/service';
export {
  createThread,
  createThreadWithMessage,
  deleteThread,
  forkThread,
  getThread,
  listThreads,
  updateThread,
} from './model/threads';
export type { AguiMessage, AguiThread } from './model/agui-mappers';
export { aguiMessageText, toAguiMessage, toAguiMessages, toAguiThread } from './model/agui-mappers';
export { readSystemPrompt, readSpecTemplate, withRagContext } from './model/schema';
