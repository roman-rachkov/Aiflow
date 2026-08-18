/**
 * Dedicated Postgres schema for a generated user app (OQ #2).
 * Must NOT be `project_{uuid}` — prisma db push of the user schema would drop
 * platform tables (Task, ChatMessage, …) if they shared a schema.
 */

import { Client } from 'pg';

export const APP_SCHEMA_PATTERN = /^app_[a-z0-9_]+$/;

/** `project_abc…` → `app_abc…` (same hex suffix). */
export function appSchemaNameFromProjectSchema(projectSchema: string): string {
  if (!projectSchema.startsWith('project_')) {
    throw new Error(`Not a project schema name: ${projectSchema}`);
  }
  return `app_${projectSchema.slice('project_'.length)}`;
}

export function assertValidAppSchemaName(name: string): void {
  if (!APP_SCHEMA_PATTERN.test(name)) {
    throw new Error(`Invalid app schema name: ${name}. Expected app_{id}.`);
  }
}

/** DATABASE_URL pointing at the user-app schema (Prisma `schema=` query). */
export function appDatabaseUrl(projectSchema: string): string {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL is not set');
  const appSchema = appSchemaNameFromProjectSchema(projectSchema);
  assertValidAppSchemaName(appSchema);
  const url = new URL(base);
  url.searchParams.set('schema', appSchema);
  return url.toString();
}

function adminUrl(): string {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL is not set');
  const url = new URL(base);
  url.searchParams.delete('schema');
  return url.toString();
}

/** CREATE SCHEMA IF NOT EXISTS for the user app. */
export async function ensureAppSchema(projectSchema: string): Promise<string> {
  const appSchema = appSchemaNameFromProjectSchema(projectSchema);
  assertValidAppSchemaName(appSchema);
  const client = new Client({ connectionString: adminUrl() });
  try {
    await client.connect();
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${appSchema}"`);
  } finally {
    await client.end();
  }
  return appSchema;
}
