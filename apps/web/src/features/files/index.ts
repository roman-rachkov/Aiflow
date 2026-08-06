/**
 * Public surface of the files feature slice. Everything outside this slice
 * (pages, API routes, other slices) imports from here. Cross-slice
 * feature→feature imports are blocked by `boundaries/dependencies` in
 * eslint.config.mjs (the policy uses `capture: slice` to require a matching
 * slice name for feature→feature, so this barrel is the only seam).
 */
export type { CreateUserFileInput, FileListItemView, UserFileView } from './model/types';
export { createUserFile, listFiles } from './model/service';
export { chunkText, estimateTokens, toVectorLiteral } from './model/chunk';
export { extractText } from './model/extract';
export { retrieveChunks, retrieveContext } from './model/retrieve';
export type { RetrievedChunk } from './model/retrieve';
export { FilePanel } from './ui/FilePanel';
