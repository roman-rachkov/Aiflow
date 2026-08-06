/**
 * RAG retrieval over a project's indexed documents (task 10).
 *
 * Symmetric to `index-service.ts` (which writes the embeddings): this module
 * reads them back via pgvector cosine distance. The per-project client is used
 * because `DocumentChunk` lives in the project schema, and the `embedding`
 * column — added by generated DDL, invisible to Prisma — is queried through
 * `$queryRawUnsafe`, casting the query literal to `::vector` the same way the
 * indexer writes it.
 *
 * The vector literal is built ONLY from floats the provider returned
 * (`toVectorLiteral` does `join(',')` over a `number[]`), never from user
 * text, so the raw SQL interpolation is injection-safe by construction. `k`
 * is bound as the `$1` parameter — never inlined.
 *
 * Failure safety is the SPEC requirement: an embed/provider failure must
 * degrade to chat-without-RAG (task 1.3), never break chat. Both exports
 * catch the embed call and return `''` / `[]` instead of throwing, so the
 * caller sees an empty context, indistinguishable from "no documents".
 */
import { createZaiProvider } from '@aiflow/ai-roles';
import { getProjectClient } from '@aiflow/db';

import { toVectorLiteral } from './chunk';

/** One retrieved chunk with its cosine distance (lower = more similar). */
export interface RetrievedChunk {
  id: string;
  content: string;
  distance: number;
}

/** Minimal provider surface this module touches — `.embed` only. */
interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}

/**
 * Run pgvector top-k retrieval against indexed documents. Returns raw rows.
 * Returns `[]` if the embed call fails (never throws) — see module doc.
 */
export async function retrieveChunks(
  schemaName: string,
  query: string,
  k = 5,
): Promise<RetrievedChunk[]> {
  const provider = createZaiProvider() as EmbeddingProvider;

  let queryVec: number[];
  try {
    const [vec] = await provider.embed([query]);
    queryVec = vec;
  } catch {
    // Provider/embedding failure: degrade to chat-without-RAG, never throw.
    return [];
  }

  const literal = toVectorLiteral(queryVec);
  const sql =
    `SELECT id, content, embedding <=> '${literal}'::vector AS distance ` +
    `FROM "DocumentChunk" ` +
    `WHERE "documentId" IN (` +
    `SELECT id FROM "Document" ` +
    `WHERE "deletedAt" IS NULL AND status = 'INDEXED') ` +
    `ORDER BY embedding <=> '${literal}'::vector LIMIT $1`;

  const client = getProjectClient(schemaName);
  // `$queryRawUnsafe` returns `unknown` per Prisma's types — cast the row
  // array to the typed shape. The column list is fixed here, so the row is
  // always `{ id: string, content: string, distance: number }`.
  const rows = (await client.$queryRawUnsafe<{ id: string; content: string; distance: number }[]>(
    sql,
    k,
  )) as { id: string; content: string; distance: number }[];

  return rows.map((r) => ({
    id: r.id,
    content: r.content,
    distance: r.distance,
  }));
}

/**
 * Format the top-k chunks as a context block for the chat prompt. Returns `''`
 * when no chunks match OR when embed fails (never throws) so the route can
 * fall back to task 1.3 chat-without-RAG by checking for falsy.
 */
export async function retrieveContext(schemaName: string, query: string, k = 5): Promise<string> {
  const chunks = await retrieveChunks(schemaName, query, k);
  if (chunks.length === 0) return '';

  const body = chunks.map((c, i) => `[Фрагмент ${(i + 1).toString()}]\n${c.content}`).join('\n\n');
  return `Контекст из загруженных документов:\n\n${body}`;
}
