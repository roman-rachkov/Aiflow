/**
 * Idempotent backfill: Task git columns (branchName, headCommit, mergedAt).
 * Existing project schemas are never re-run through createProjectSchema.
 */

import { Client } from 'pg';

import { assertValidSchemaName } from './project-schema';

const TASK_GIT_DDL = `
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "branchName" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "headCommit" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "mergedAt" TIMESTAMP(3);
`;

function databaseUrl(): string {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL is not set');
  const url = new URL(base);
  url.searchParams.delete('schema');
  return url.toString();
}

/** Add Task git columns when missing. Safe on every tasks/code request. */
export async function ensureTaskGitColumns(schemaName: string): Promise<void> {
  assertValidSchemaName(schemaName);
  const client = new Client({ connectionString: databaseUrl() });
  try {
    await client.connect();
    await client.query('BEGIN');
    await client.query(`SET search_path TO "${schemaName}", public;`);
    await client.query(TASK_GIT_DDL);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}
