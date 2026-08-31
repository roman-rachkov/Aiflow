/**
 * Public surface of the support-bot feature slice.
 *
 * Server-side service (RAG retrieval + LLM streaming) is exported for the API
 * route. UI component is exported for the shell `ProjectRoutes`. Types are
 * exported for consumers that need them (API validation, tests).
 *
 * Note: `streamSupportAnswer` takes a `SupportBotDeps` argument for the
 * `retrieveChunks` function. The caller (API route in `app/`) supplies this
 * dependency — cross-slice feature→feature imports are forbidden by
 * `boundaries/dependencies` (eslint.config.mjs).
 */
export type { SupportChatRequest, SupportChatDelta, SupportChatDone } from './model/types';
export type { SupportBotDeps, RetrievedChunkLike } from './model/service';
export { streamSupportAnswer } from './model/service';
export { SupportBotPanel } from './ui/SupportBotPanel';
