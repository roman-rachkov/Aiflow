/**
 * RAG public surface of the files slice (retrieval + text pipeline helpers).
 *
 * Kept off `./index` so listing/uploading files does not pull `pdf-parse` /
 * LlamaIndex into every consumer's module graph (breaks Next.js RSC webpack).
 */
export { chunkText, estimateTokens, toVectorLiteral } from './model/chunk';
export { extractText } from './model/extract';
export { retrieveChunks, retrieveContext } from './model/retrieve';
export type { RetrievedChunk } from './model/retrieve';
