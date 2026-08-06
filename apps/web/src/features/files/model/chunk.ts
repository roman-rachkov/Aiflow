/**
 * Chunking and embedding-shaped helpers for the indexing pipeline (task 2.x).
 * Pure module: no Prisma, no DB, no I/O. Used by the indexing service right
 * after `extractText` — extracted text is split into ~512-token chunks, each
 * chunk is embedded upstream, and `toVectorLiteral` formats a chunk's vector
 * as the pgvector literal the `DocumentChunk.embedding` column stores.
 *
 * `SentenceSplitter` comes from the umbrella `llamaindex` package (License:
 * MIT, verified from node_modules/llamaindex/LICENSE). The minimal
 * `@llamaindex/text-splitter` sub-path the brief suggested as an alternative
 * does not exist on the npm registry (HTTP 404 on the scoped name) — it is an
 * internal workspace package in the LlamaIndex.TS monorepo that is not
 * independently published. The umbrella package was used instead; its dep tree
 * added 38 packages / ~158 MiB and `yarn install` completed in ~20 s, which is
 * not slow enough to justify hunting for a narrower path.
 */
import { SentenceSplitter } from 'llamaindex';

/** Default chunk size (tokens) — RAG-friendly target for embedding models. */
export const DEFAULT_CHUNK_SIZE = 512;

/** Default overlap (tokens) between adjacent chunks to preserve context. */
export const DEFAULT_CHUNK_OVERLAP = 50;

/** `chunkText` options — both optional, falling back to the 512/50 defaults. */
export interface ChunkOptions {
  chunkSize?: number;
  overlap?: number;
}

/**
 * Split `text` into roughly equal chunks, preferring sentence boundaries.
 *
 * The `SentenceSplitter` constructor option for overlap is `chunkOverlap` (not
 * `overlap`) — verified against `@llamaindex/core/node-parser` types. Defaults
 * are 1024/200 in the library; we override to 512/50 for this pipeline.
 */
export function chunkText(text: string, opts?: ChunkOptions): string[] {
  const chunkSize = opts?.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const chunkOverlap = opts?.overlap ?? DEFAULT_CHUNK_OVERLAP;
  const splitter = new SentenceSplitter({ chunkSize, chunkOverlap });
  return splitter.splitText(text);
}

/**
 * Cheap token estimate: ~4 chars per token for English text. Used for
 * pre-flight size checks and logging before any real tokenizer runs.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Format a vector as a pgvector literal (`'[1,2,3]'`) for an `INSERT`/`UPDATE`
 * against a `vector(N)` column. Raw `join(',')` is intentional — no float
 * formatting, no rounding — so the vector round-trips losslessly.
 */
export function toVectorLiteral(vec: number[]): string {
  return '[' + vec.join(',') + ']';
}
