/**
 * Dev-only: index docs + filtered source into a stable project schema for
 * local RAG (agent MCP + Analyst dogfood). No MinIO — bare Document rows.
 * Idempotent: reuses `.local/dev-rag.json` / DEV_RAG_SCHEMA_NAME.
 *
 *   yarn workspace @aiflow/web docs:ingest
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

import { createProviderFromEnv } from '@aiflow/ai-roles';
import { disconnectAll, getProjectClient } from '@aiflow/db';

import { chunkText, estimateTokens, toVectorLiteral } from '../src/features/files/model/chunk';
import { extractText } from '../src/features/files/model/extract';
import { retrieveChunks } from '../src/features/files/model/retrieve';

import { loadEnvLocal, REPO_ROOT, resolveStableSchema, toRepoRelPath } from './dev-rag-shared';

const MAX_FILE_BYTES = 200 * 1024;

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'build',
  'coverage',
  'generated',
  '.git',
  '.yarn',
  'agent-transcripts',
]);

const CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.prisma', '.md', '.css']);

const DOC_SOURCE = 'SPECIFICATION' as const;
const CODE_SOURCE = 'UPLOAD' as const;

interface CorpusFile {
  absPath: string;
  relPath: string;
  sourceType: typeof DOC_SOURCE | typeof CODE_SOURCE;
}

/** Collect state markdown at repo root + docs/*.md. */
function collectStateDocs(): CorpusFile[] {
  const out: CorpusFile[] = [];
  const docsDir = join(REPO_ROOT, 'docs');
  if (existsSync(docsDir)) {
    for (const name of readdirSync(docsDir)) {
      if (!name.endsWith('.md')) continue;
      const abs = join(docsDir, name);
      out.push({ absPath: abs, relPath: toRepoRelPath(abs), sourceType: DOC_SOURCE });
    }
  }
  for (const name of ['CLAUDE.md', 'AGENTS.md']) {
    const abs = join(REPO_ROOT, name);
    if (!existsSync(abs)) continue;
    out.push({ absPath: abs, relPath: toRepoRelPath(abs), sourceType: DOC_SOURCE });
  }
  return out;
}

/** Recursively walk a tree; skip noise dirs and oversized files. */
function walkSourceTree(dir: string, acc: CorpusFile[]): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) {
      walkSourceTree(abs, acc);
      continue;
    }
    if (!CODE_EXTS.has(extname(name).toLowerCase())) continue;
    if (st.size > MAX_FILE_BYTES) continue;
    acc.push({ absPath: abs, relPath: toRepoRelPath(abs), sourceType: CODE_SOURCE });
  }
}

/** Collect .claude agent/command/skill markdown. */
function collectClaudeMarkdown(): CorpusFile[] {
  const out: CorpusFile[] = [];
  const roots = [join(REPO_ROOT, '.claude', 'agents'), join(REPO_ROOT, '.claude', 'commands')];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const name of readdirSync(root)) {
      if (!name.endsWith('.md')) continue;
      const abs = join(root, name);
      out.push({ absPath: abs, relPath: toRepoRelPath(abs), sourceType: DOC_SOURCE });
    }
  }
  const skillsRoot = join(REPO_ROOT, '.claude', 'skills');
  if (existsSync(skillsRoot)) walkSkills(skillsRoot, out);
  return out;
}

/** Find SKILL.md files under .claude/skills. */
function walkSkills(dir: string, acc: CorpusFile[]): void {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) {
      walkSkills(abs, acc);
      continue;
    }
    if (name !== 'SKILL.md') continue;
    acc.push({ absPath: abs, relPath: toRepoRelPath(abs), sourceType: DOC_SOURCE });
  }
}

/** Full corpus: docs/state + packages/apps/services/tools + .claude prompts. */
export function collectCorpus(): CorpusFile[] {
  const byPath = new Map<string, CorpusFile>();
  const add = (f: CorpusFile): void => {
    byPath.set(f.relPath, f);
  };
  for (const f of collectStateDocs()) add(f);
  for (const f of collectClaudeMarkdown()) add(f);
  const codeRoots = ['apps', 'packages', 'services', 'tools'].map((d) => join(REPO_ROOT, d));
  const codeAcc: CorpusFile[] = [];
  for (const root of codeRoots) walkSourceTree(root, codeAcc);
  for (const f of codeAcc) add(f);
  return [...byPath.values()].sort((a, b) => a.relPath.localeCompare(b.relPath));
}

/** Read file bytes as utf8 text for embedding. */
async function readFileText(absPath: string, relPath: string): Promise<string> {
  const bytes = readFileSync(absPath);
  const ext = extname(relPath).toLowerCase();
  const mime = ext === '.md' ? 'text/markdown' : 'text/plain';
  const text = await extractText(bytes, mime);
  if (!text?.trim()) throw new Error(`empty extract: ${relPath}`);
  return text;
}

/** Ensure a Document row for `relPath` is in INDEXING state; return its id. */
async function ensureIndexingDoc(schemaName: string, file: CorpusFile): Promise<string> {
  const client = getProjectClient(schemaName);
  const existing = await client.document.findFirst({
    where: { title: file.relPath, deletedAt: null },
  });
  if (existing) {
    await client.document.update({
      where: { id: existing.id },
      data: { status: 'INDEXING', sourceType: file.sourceType },
    });
    return existing.id;
  }
  const created = await client.document.create({
    data: {
      sourceType: file.sourceType,
      title: file.relPath,
      status: 'INDEXING',
    },
  });
  return created.id;
}

/** Replace all chunks for a document with freshly embedded vectors. */
async function writeChunks(
  schemaName: string,
  documentId: string,
  chunks: string[],
  vectors: number[][],
): Promise<void> {
  const client = getProjectClient(schemaName);
  await client.$transaction(async (tx) => {
    await tx.documentChunk.deleteMany({ where: { documentId } });
    for (let i = 0; i < chunks.length; i += 1) {
      const created = await tx.documentChunk.create({
        data: {
          documentId,
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
}

/** Upsert one path: soft-replace chunks under Document.title = relPath. */
async function indexFile(
  schemaName: string,
  file: CorpusFile,
): Promise<{ title: string; chunks: number }> {
  const text = await readFileText(file.absPath, file.relPath);
  const chunks = chunkText(text);
  if (chunks.length === 0) throw new Error(`no chunks: ${file.relPath}`);

  const documentId = await ensureIndexingDoc(schemaName, file);
  const client = getProjectClient(schemaName);
  try {
    const vectors = await createProviderFromEnv().embed(chunks.map((c) => `search_document: ${c}`));
    await writeChunks(schemaName, documentId, chunks, vectors);
    await client.document.update({
      where: { id: documentId },
      data: { status: 'INDEXED', indexedAt: new Date(), deletedAt: null },
    });
    return { title: file.relPath, chunks: chunks.length };
  } catch (err) {
    await client.document.update({
      where: { id: documentId },
      data: { status: 'FAILED' },
    });
    throw err;
  }
}

/** Soft-delete INDEXED docs whose titles are no longer in the corpus. */
async function softDeleteStale(schemaName: string, keep: Set<string>): Promise<number> {
  const client = getProjectClient(schemaName);
  const rows = await client.document.findMany({
    where: { deletedAt: null },
    select: { id: true, title: true },
  });
  let n = 0;
  const now = new Date();
  for (const row of rows) {
    if (keep.has(row.title)) continue;
    await client.document.update({
      where: { id: row.id },
      data: { deletedAt: now },
    });
    n += 1;
  }
  return n;
}

async function main(): Promise<void> {
  loadEnvLocal();
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

  const { schemaName, projectId } = await resolveStableSchema({ createIfMissing: true });
  console.log(`projectId=${projectId}`);
  console.log(`schemaName=${schemaName}`);

  const files = collectCorpus();
  const keep = new Set(files.map((f) => f.relPath));
  let totalChunks = 0;
  for (const file of files) {
    const { title, chunks } = await indexFile(schemaName, file);
    totalChunks += chunks;
    console.log(`indexed ${title}: ${String(chunks)} chunks`);
  }
  const stale = await softDeleteStale(schemaName, keep);
  console.log(
    `done: ${String(files.length)} files, ${String(totalChunks)} chunks, staleSoftDeleted=${String(stale)}`,
  );

  const sample = await retrieveChunks(schemaName, 'what is the RAG pipeline', 3);
  console.log('--- retrieveChunks sample ---');
  for (const c of sample) {
    console.log(`path=${c.path} dist=${String(c.distance)} len=${String(c.content.length)}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void disconnectAll());
