/**
 * Renders `prisma/schema_project_template.prisma` into the SQL that creates one
 * project schema.
 *
 * Why this exists rather than `prisma migrate`: project schemas are created at
 * runtime, one per project, with names not known until a `ProjectMeta` row is
 * inserted. Prisma migrations target a fixed schema set, so they cannot express
 * this (docs/03-data-model.md § 8).
 *
 * Usage:
 *   tsx scripts/generate-project-sql.ts <schema_name> [--out <file>]
 *
 * The output is deliberately a file, not a live connection: the caller decides
 * when to apply it, and the same SQL can be replayed against an existing schema
 * when the template changes.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

const PROJECT_SCHEMA_PATTERN = /^project_[a-z0-9_]+$/;

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = join(packageRoot, 'prisma', 'schema_project_template.prisma');

/**
 * Columns Prisma cannot express. `DocumentChunk.embedding` is a pgvector
 * column, and the HNSW index over it is what makes RAG retrieval usable at all
 * — a sequential scan over embeddings defeats the purpose.
 *
 * Dimension 1536 matches OpenAI text-embedding-3-small. Changing the embedding
 * model changes this number, and existing rows become invalid.
 */
const VECTOR_DDL = `
-- pgvector column and index (not expressible in the Prisma schema)
ALTER TABLE "DocumentChunk" ADD COLUMN IF NOT EXISTS embedding vector(1536);
CREATE INDEX IF NOT EXISTS "DocumentChunk_embedding_idx"
  ON "DocumentChunk" USING hnsw (embedding vector_cosine_ops);
`;

function assertValidSchemaName(name: string): void {
  if (!PROJECT_SCHEMA_PATTERN.test(name)) {
    throw new Error(
      `Invalid schema name: ${name}. Expected project_{id}, lowercase alphanumeric and underscores.`,
    );
  }
}

/**
 * Ask Prisma for the DDL. `migrate diff --from-empty` prints the statements that
 * would create the schema from nothing, which is exactly the shape needed here
 * and keeps the SQL derived from the template rather than hand-maintained
 * alongside it.
 */
function renderTableDdl(): string {
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
    `-- Everything below runs inside the new schema.`,
    `SET search_path TO "${schemaName}";`,
    ``,
    renderTableDdl().trim(),
    VECTOR_DDL.trim(),
    ``,
    `RESET search_path;`,
    ``,
  ].join('\n');
}

function main(): void {
  const [schemaName, ...rest] = process.argv.slice(2);
  if (!schemaName) {
    console.error('Usage: tsx scripts/generate-project-sql.ts <schema_name> [--out <file>]');
    process.exit(1);
  }

  const sql = generateProjectSql(schemaName);
  const outFlag = rest.indexOf('--out');

  if (outFlag !== -1) {
    const target = rest[outFlag + 1];
    if (!target) throw new Error('--out requires a file path');
    writeFileSync(target, sql);
    console.error(`Wrote ${target}`);
  } else {
    process.stdout.write(sql);
  }
}

// Only run when invoked directly, so the export stays importable from tests.
//
// `pathToFileURL`, not string concatenation: on Windows `import.meta.url` is
// `file:///D:/...` (three slashes) while a hand-built `file://` + path gives
// two, so the naive comparison silently never matches and main() never runs.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
