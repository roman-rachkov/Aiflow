/**
 * Client-only public surface of the files slice.
 *
 * Separated from `./index` so Node-only indexing deps (`pdf-parse`, LlamaIndex,
 * MinIO/Prisma loaders) are never pulled into the client bundle via a shared
 * barrel with `FilePanel`. See `features/chat/client.ts` for the Next.js
 * barrel-contamination rationale.
 */
export { FilePanel } from './ui/FilePanel';
export type { FilePanelProps } from './ui/FilePanel';
