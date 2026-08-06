/**
 * Dev-only CLI: query the stable dogfood RAG index without MCP.
 *
 *   yarn workspace @aiflow/web rag:query -- "soft delete Document"
 */
import { disconnectAll, getProjectClient } from '@aiflow/db';

import { retrieveChunks } from '../src/features/files/model/retrieve';

import { loadEnvLocal, resolveStableSchema } from './dev-rag-shared';

function parseArgs(argv: string[]): { query: string; k: number } {
  const args = argv.filter((a) => a !== '--');
  let k = 5;
  const parts: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--k' && args[i + 1]) {
      k = Number(args[i + 1]);
      i += 1;
      continue;
    }
    parts.push(args[i]);
  }
  const query = parts.join(' ').trim();
  if (!query) throw new Error('Usage: rag:query [--k N] <query text>');
  if (!Number.isFinite(k) || k < 1) throw new Error('--k must be a positive number');
  return { query, k };
}

async function statusBlock(schemaName: string): Promise<string> {
  const client = getProjectClient(schemaName);
  const indexed = await client.document.count({
    where: { deletedAt: null, status: 'INDEXED' },
  });
  const latest = await client.document.findFirst({
    where: { deletedAt: null, status: 'INDEXED' },
    orderBy: { indexedAt: 'desc' },
    select: { indexedAt: true },
  });
  const at = latest?.indexedAt?.toISOString() ?? '(none)';
  return `schema=${schemaName} indexedDocs=${String(indexed)} lastIndexedAt=${at}`;
}

async function main(): Promise<void> {
  loadEnvLocal();
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

  const { query, k } = parseArgs(process.argv.slice(2));
  const { schemaName } = await resolveStableSchema();
  console.log(await statusBlock(schemaName));

  const chunks = await retrieveChunks(schemaName, query, k);
  if (chunks.length === 0) {
    console.log('(no hits — run docs:ingest first, check embeddings)');
    return;
  }
  for (const c of chunks) {
    console.log('---');
    console.log(`path=${c.path} distance=${String(c.distance)}`);
    console.log(c.content.slice(0, 600));
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void disconnectAll());
