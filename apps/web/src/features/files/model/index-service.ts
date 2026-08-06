/**
 * Synchronous indexing pipeline for an uploaded file (task 9).
 *
 * Runs against the project's own schema via `getProjectClient`: load the
 * `UserFile` + linked `Document`, pull the bytes from MinIO, extract text,
 * chunk it, embed the chunks, and atomically replace the `DocumentChunk` rows
 * (delete-then-create in one `$transaction`) writing each embedding as a
 * `'[...]'::vector` literal through `$executeRaw` — Prisma has no vector type,
 * so the column is invisible to the client and must be written as raw SQL.
 *
 * Failure safety is the invariant: the `Document` row is flipped to `INDEXING`
 * before any I/O and must end the call as either `INDEXED` or `FAILED`, never
 * left dangling. Any throw inside the pipeline (steps 3-8 of the brief) is
 * caught, the row is marked `FAILED`, and the caller gets a structured
 * `{ status: 'FAILED', reason }` — the route never sees a throw from here.
 *
 * The vector literal is built ONLY from floats the provider returned
 * (`toVectorLiteral` does `join(',')` over a `number[]`), never from user
 * text, so the raw SQL interpolation is injection-safe by construction.
 */
import { createZaiProvider } from '@aiflow/ai-roles';
import { getProjectClient } from '@aiflow/db';

import { getObject } from '@/shared/minio';

import { chunkText, estimateTokens, toVectorLiteral } from './chunk';
import { extractText } from './extract';

/** Outcome shape reported up to the route handler. */
export interface IndexResult {
  documentId: string;
  status: 'INDEXED' | 'FAILED';
  chunkCount: number;
  reason?: string;
}

/** The per-project Prisma client, as returned by `getProjectClient`. */
type ProjectClient = ReturnType<typeof getProjectClient>;

/** Transaction client: everything except the `$transaction`/connect denylist. */
type TxClient = Parameters<Parameters<ProjectClient['$transaction']>[0]>[0];

/**
 * Load the file + its 1:1 `Document`. Returns the linked document id, or a
 * pre-built FAILED result when the file is missing/deleted or has no document
 * relation yet. Kept as a guard so the main flow can early-return cleanly.
 */
async function loadFileAndDocument(
  client: ProjectClient,
  fileId: string,
): Promise<{ documentId: string } | IndexResult> {
  const file = await client.userFile.findUnique({
    where: { id: fileId, deletedAt: null },
    include: { document: true },
  });
  if (!file) {
    return { documentId: '', status: 'FAILED', chunkCount: 0, reason: 'file not found' };
  }
  if (!file.document) {
    return { documentId: '', status: 'FAILED', chunkCount: 0, reason: 'document relation missing' };
  }
  return { documentId: file.document.id };
}

/**
 * Flip the `Document` status. Centralised so the `INDEXING` write and every
 * FAILED write share one helper, guaranteeing the row is never left
 * `INDEXING`. `reason` is reported to the caller only, not persisted, so this
 * stays a one- or two-column update.
 */
async function setStatus(
  client: ProjectClient,
  fileId: string,
  status: 'INDEXING' | 'FAILED' | 'INDEXED',
  indexedAt?: Date,
): Promise<void> {
  await client.document.update({
    where: { userFileId: fileId },
    data: { status, ...(indexedAt ? { indexedAt } : {}) },
  });
}

/**
 * Atomically replace a document's chunks and write each embedding.
 *
 * Runs inside a callback `$transaction` so the `deleteMany`, every `create`,
 * and every `$executeRaw` share one transaction — a re-index fully replaces
 * the old chunks or leaves them untouched, no partial state. The raw UPDATE
 * uses a `::vector` cast because pgvector's column type is absent from the
 * Prisma schema (added by generated DDL); the literal is provider floats only.
 */
async function writeChunks(
  tx: TxClient,
  documentId: string,
  chunks: string[],
  vectors: number[][],
): Promise<void> {
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
    )}::vector WHERE id = ${created.id}`;
  }
}

/**
 * Steps 3-8 of the pipeline (bytes → text → chunks → embed → write).
 * Isolated so the caller's `try/catch` covers exactly this body; the
 * `INDEXING` flip happens outside it. Throws on any failure — the caller maps
 * a throw to a FAILED result.
 */
async function runIndex(
  client: ProjectClient,
  fileId: string,
  documentId: string,
): Promise<number> {
  const file = await client.userFile.findUnique({
    where: { id: fileId },
    select: { storageKey: true, mimeType: true },
  });
  if (!file) throw new Error('file not found');

  const bytes = await getObject(file.storageKey);
  const text = await extractText(bytes, file.mimeType);
  if (text === null) throw new Error('unsupported/failed extraction');

  const chunks = chunkText(text);
  if (chunks.length === 0) throw new Error('no chunks produced');

  const vectors = await createZaiProvider().embed(chunks);

  await client.$transaction(async (tx) => {
    await writeChunks(tx, documentId, chunks, vectors);
  });
  return chunks.length;
}

/**
 * Index one file end-to-end. Public entry point used by the route handler.
 *
 * Sequence: resolve file+document (FAILED early if absent) → mark `INDEXING`
 * → run the pipeline inside a try/catch that maps any throw to FAILED → on
 * success mark `INDEXED` with `indexedAt` and report the chunk count. The
 * document is guaranteed to leave `INDEXING` on every code path: the success
 * branch sets INDEXED, the catch branch sets FAILED (best-effort, errors
 * swallowed so the original reason is what the caller sees).
 */
export async function indexDocument(schemaName: string, fileId: string): Promise<IndexResult> {
  const client = getProjectClient(schemaName);

  const resolved = await loadFileAndDocument(client, fileId);
  if ('status' in resolved) return resolved;
  const { documentId } = resolved;

  await setStatus(client, fileId, 'INDEXING');

  try {
    const chunkCount = await runIndex(client, fileId, documentId);
    await setStatus(client, fileId, 'INDEXED', new Date());
    return { documentId, status: 'INDEXED', chunkCount };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'indexing failed';
    await setStatus(client, fileId, 'FAILED').catch(() => {});
    return { documentId, status: 'FAILED', chunkCount: 0, reason };
  }
}
