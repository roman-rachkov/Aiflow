/**
 * Renders `prisma/schema_project_template.prisma` into the SQL that creates one
 * project schema.
 *
 * Why this exists rather than `prisma migrate`: project schemas are created at
 * runtime, one per project, with names not known until a `ProjectMeta` row is
 * inserted. Prisma migrations target a fixed schema set, so they cannot express
 * this (docs/03-data-model.md § 8).
 *
 * Everything here is pure — it renders SQL strings without touching a database.
 * Applying the SQL at runtime is the job of `./schema-executor`; the
 * `scripts/generate-project-sql.ts` CLI is a thin wrapper over this module, so
 * the same generator serves both the request path and the manual `project-sql`
 * script. Exported from the package through `./index`.
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

export const PROJECT_SCHEMA_PATTERN = /^project_[a-z0-9_]+$/;

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = join(packageRoot, 'prisma', 'schema_project_template.prisma');

/**
 * Columns Prisma cannot express. `DocumentChunk.embedding` is a pgvector
 * column, and the HNSW index over it is what makes RAG retrieval usable at all
 * — a sequential scan over embeddings defeats the purpose.
 *
 * Dimension 768 matches nomic-embed-text-v1.5 (LM Studio local test). Changing
 * the embedding model changes this number, and existing rows become invalid.
 */
const VECTOR_DDL = `
-- pgvector column and index (not expressible in the Prisma schema)
ALTER TABLE "DocumentChunk" ADD COLUMN IF NOT EXISTS embedding vector(768);
CREATE INDEX IF NOT EXISTS "DocumentChunk_embedding_idx"
  ON "DocumentChunk" USING hnsw (embedding vector_cosine_ops);
`;

export function assertValidSchemaName(name: string): void {
  if (!PROJECT_SCHEMA_PATTERN.test(name)) {
    throw new Error(
      `Invalid schema name: ${name}. Expected project_{id}, lowercase alphanumeric and underscores.`,
    );
  }
}

/**
 * A fresh schema name for a new project: `project_` + 32 lowercase hex chars
 * from a UUID with the dashes stripped. Matches PROJECT_SCHEMA_PATTERN and is
 * shorter than a dashed UUID (which the pattern would reject).
 *
 * Collision risk is ~2⁻¹²² and the create flow is schema-first, so a collision
 * is not retried: it is dropped as part of the rollback and the user retries.
 */
export function generateProjectSchemaName(): string {
  return `project_${randomUUID().replaceAll('-', '')}`;
}

/**
 * Ask Prisma for the DDL. `migrate diff --from-empty` prints the statements that
 * would create the schema from nothing, which is exactly the shape needed here
 * and keeps the SQL derived from the template rather than hand-maintained
 * alongside it.
 *
 * Exported so tests can stub it; it is internal to this package and not
 * re-exported from `./index`.
 */
export function renderTableDdl(): string {
  const scratch = mkdtempSync(join(tmpdir(), 'aiflow-schema-'));
  try {
    // The template's own `env("DATABASE_URL")` is irrelevant for --from-empty,
    // but Prisma still parses the datasource block, so a value must exist.
    const copy = join(scratch, 'schema.prisma');
    writeFileSync(copy, readFileSync(templatePath, 'utf8'));

    // Run Prisma's JS entry point under the current Node binary rather than
    // going through `npx`. On Windows npx resolves to npx.cmd, which Node 22
    // refuses to spawn without a shell (EINVAL), and enabling the shell would
    // then require quoting temp paths by hand.
    const prismaBin = require.resolve('prisma/build/index.js', { paths: [packageRoot] });

    return execFileSync(
      process.execPath,
      [prismaBin, 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', copy, '--script'],
      {
        cwd: packageRoot,
        encoding: 'utf8',
        env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://x/x' },
      },
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

export function generateProjectSql(schemaName: string): string {
  assertValidSchemaName(schemaName);

  return [
    `-- Schema for project ${schemaName}`,
    `-- Generated from prisma/schema_project_template.prisma. Do not edit by hand.`,
    ``,
    `CREATE SCHEMA IF NOT EXISTS "${schemaName}";`,
    ``,
    // `public` stays on the search_path so extension types (pgvector's
    // `vector`, pgcrypto helpers) resolve inside the new schema. Without it
    // the pgvector column DDL below fails with `type "vector" does not exist`
    // because the extension lives in `public`, not the freshly-created schema.
    `-- Everything below runs inside the new schema.`,
    `SET search_path TO "${schemaName}", public;`,
    ``,
    renderTableDdl().trim(),
    VECTOR_DDL.trim(),
    ``,
    `RESET search_path;`,
    ``,
  ].join('\n');
}
