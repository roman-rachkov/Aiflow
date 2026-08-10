/**
 * pgvector RAG retrieval for chat:run (never throws — degrades to '').
 */

import { createProviderFromEnv } from '@aiflow/ai-roles';
import { getProjectClient } from '@aiflow/db';

function toVectorLiteral(vec: number[]): string {
  return '[' + vec.join(',') + ']';
}

interface ChunkRow {
  id: string;
  content: string;
  distance: number;
  path: string;
}

/** Format top-k chunks as a context block, or '' on embed/empty failure. */
export async function retrieveContext(schemaName: string, query: string, k = 5): Promise<string> {
  try {
    const [vec] = await createProviderFromEnv().embed([`search_query: ${query}`]);
    const literal = toVectorLiteral(vec);
    const sql =
      `SELECT c.id, c.content, d.title AS path, ` +
      `c.embedding OPERATOR(public.<=>) '${literal}'::public.vector AS distance ` +
      `FROM "DocumentChunk" c ` +
      `INNER JOIN "Document" d ON d.id = c."documentId" ` +
      `WHERE d."deletedAt" IS NULL AND d.status = 'INDEXED' ` +
      `ORDER BY c.embedding OPERATOR(public.<=>) '${literal}'::public.vector LIMIT $1`;
    const rows = await getProjectClient(schemaName).$queryRawUnsafe<ChunkRow[]>(sql, k);
    if (rows.length === 0) return '';
    const body = rows
      .map((c, i) => `[Фрагмент ${(i + 1).toString()} — ${c.path}]\n${c.content}`)
      .join('\n\n');
    return `Контекст из загруженных документов:\n\n${body}`;
  } catch {
    return '';
  }
}
