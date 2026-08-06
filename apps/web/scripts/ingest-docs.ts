/**
 * Dev-only: index `docs/*.md` (+ CLAUDE.md) into a fresh project schema for
 * local RAG against LM Studio / nomic-embed. No MinIO — bare Document rows.
 *
 *   yarn workspace @aiflow/web docs:ingest
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createProviderFromEnv } from '@aiflow/ai-roles';
import {
  createProjectSchema,
  disconnectAll,
  generateProjectSchemaName,
  getProjectClient,
  getPublicClient,
} from '@aiflow/db';

import { chunkText, estimateTokens, toVectorLiteral } from '../src/features/files/model/chunk';
import { extractText } from '../src/features/files/model/extract';
import { retrieveContext } from '../src/features/files/model/retrieve';

const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url));
const WEB_ROOT = resolve(SCRIPT_DIR, '..');
const REPO_ROOT = resolve(WEB_ROOT, '../..');

/** Strip surrounding single/double quotes from an env value. */
function unquote(val: string): string {
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    return val.slice(1, -1);
  }
  return val;
}

/** Parse one KEY=VALUE line; returns null for blanks/comments/malformed. */
function parseEnvLine(line: string): { key: string; val: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const eq = trimmed.indexOf('=');
  if (eq < 1) return null;
  return { key: trimmed.slice(0, eq).trim(), val: unquote(trimmed.slice(eq + 1).trim()) };
}

/** Load KEY=VALUE lines from apps/web/.env.local when vars are unset. */
function loadEnvLocal(): void {
  const path = join(WEB_ROOT, '.env.local');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    if (process.env[parsed.key] === undefined) process.env[parsed.key] = parsed.val;
  }
}

/** Markdown paths under docs/ plus optional CLAUDE.md at repo root. */
function collectDocFiles(): string[] {
  const docsDir = join(REPO_ROOT, 'docs');
  const files = readdirSync(docsDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => join(docsDir, f));
  const claude = join(REPO_ROOT, 'CLAUDE.md');
  if (existsSync(claude)) files.push(claude);
  return files;
}

async function indexFile(
  schemaName: string,
  filePath: string,
): Promise<{ title: string; chunks: number }> {
  const title = basename(filePath);
  const bytes = readFileSync(filePath);
  const text = await extractText(bytes, 'text/markdown');
  if (!text) throw new Error(`extract failed: ${title}`);

  const client = getProjectClient(schemaName);
  const doc = await client.document.create({
    data: { sourceType: 'SPECIFICATION', title, status: 'INDEXING' },
  });

  try {
    const chunks = chunkText(text);
    if (chunks.length === 0) throw new Error(`no chunks: ${title}`);
    const vectors = await createProviderFromEnv().embed(chunks.map((c) => `search_document: ${c}`));
    await client.$transaction(async (tx) => {
      await tx.documentChunk.deleteMany({ where: { documentId: doc.id } });
      for (let i = 0; i < chunks.length; i += 1) {
        const created = await tx.documentChunk.create({
          data: {
            documentId: doc.id,
            chunkIndex: i,
            content: chunks[i],
            tokenCount: estimateTokens(chunks[i]),
          },
        });
        await tx.$executeRaw`UPDATE "DocumentChunk" SET embedding = ${toVectorLiteral(
          vectors[i],
        )}::public.vector WHERE id = ${created.id}`;
      }
    });
    await client.document.update({
      where: { id: doc.id },
      data: { status: 'INDEXED', indexedAt: new Date() },
    });
    return { title, chunks: chunks.length };
  } catch (err) {
    await client.document.update({
      where: { id: doc.id },
      data: { status: 'FAILED' },
    });
    throw err;
  }
}

async function main(): Promise<void> {
  loadEnvLocal();
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

  const publicDb = getPublicClient();
  const owner = await publicDb.user.findFirst({ where: { deletedAt: null } });
  if (!owner) {
    throw new Error('No user in public.User — run: yarn workspace @aiflow/db seed:dev-user');
  }

  const schemaName = generateProjectSchemaName();
  await createProjectSchema(schemaName);
  const project = await publicDb.projectMeta.create({
    data: {
      name: 'LM Studio docs RAG',
      description: 'Auto-ingested docs/ for local RAG test',
      schemaName,
      ownerId: owner.id,
      status: 'ACTIVE',
    },
  });

  console.log(`projectId=${project.id}`);
  console.log(`schemaName=${schemaName}`);

  const files = collectDocFiles();
  let totalChunks = 0;
  for (const file of files) {
    const { title, chunks } = await indexFile(schemaName, file);
    totalChunks += chunks;
    console.log(`indexed ${title}: ${String(chunks)} chunks`);
  }
  console.log(`done: ${String(files.length)} files, ${String(totalChunks)} chunks`);

  const sample = await retrieveContext(schemaName, 'what is the RAG pipeline');
  console.log('--- retrieveContext sample ---');
  console.log(sample ? sample.slice(0, 800) : '(empty)');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void disconnectAll());
