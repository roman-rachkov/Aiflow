/**
 * Dev-only MCP server: semantic search over the stable repo RAG index.
 * Tools: `search`, `status`. Reindex via `yarn workspace @aiflow/web docs:ingest`.
 *
 * Wired in repo-root `.mcp.json` as `aiflow-rag`.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { disconnectAll, getProjectClient } from '@aiflow/db';

import { retrieveChunks } from '../src/features/files/model/retrieve';

import { loadEnvLocal, resolveStableSchema } from './dev-rag-shared';

loadEnvLocal();

const server = new McpServer({ name: 'aiflow-rag', version: '0.1.0' });

/** Resolve schema or throw a tool-friendly Error. */
async function requireSchema(): Promise<string> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set (apps/web/.env.local)');
  }
  const { schemaName } = await resolveStableSchema();
  return schemaName;
}

/** Wrap tool body errors as MCP text error results. */
async function asToolText(run: () => Promise<string>): Promise<{
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}> {
  try {
    const text = await run();
    return { content: [{ type: 'text', text }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
  }
}

/** status tool body. */
async function toolStatus(): Promise<string> {
  const schemaName = await requireSchema();
  const client = getProjectClient(schemaName);
  const indexed = await client.document.count({
    where: { deletedAt: null, status: 'INDEXED' },
  });
  const latest = await client.document.findFirst({
    where: { deletedAt: null, status: 'INDEXED' },
    orderBy: { indexedAt: 'desc' },
    select: { indexedAt: true },
  });
  return JSON.stringify(
    {
      schemaName,
      indexedDocs: indexed,
      lastIndexedAt: latest?.indexedAt?.toISOString() ?? null,
      reindex: 'yarn workspace @aiflow/web docs:ingest',
    },
    null,
    2,
  );
}

/** search tool body. */
async function toolSearch(query: string, k: number): Promise<string> {
  const schemaName = await requireSchema();
  const chunks = await retrieveChunks(schemaName, query, k);
  return JSON.stringify(
    chunks.map((c) => ({
      path: c.path,
      distance: c.distance,
      content: c.content,
    })),
    null,
    2,
  );
}

server.registerTool(
  'search',
  {
    description:
      'Semantic search over AI Studio docs + filtered source (pgvector). ' +
      'Use for concepts / "where does X live". Prefer Grep for exact symbols.',
    inputSchema: {
      query: z.string().describe('Natural-language search query'),
      k: z.number().min(1).max(20).optional().describe('Top-k chunks (default 5)'),
    },
  },
  async (args) =>
    asToolText(async () => {
      const query = args.query.trim();
      if (!query) throw new Error('search requires query');
      const k = typeof args.k === 'number' ? args.k : 5;
      return toolSearch(query, k);
    }),
);

server.registerTool(
  'status',
  {
    description: 'Show dogfood RAG schema name, indexed doc count, last indexedAt',
  },
  async () => asToolText(toolStatus),
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error(error);
  void disconnectAll();
  process.exitCode = 1;
});
