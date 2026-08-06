/**
 * Shared helpers for dev-time repo RAG scripts (ingest / query / MCP).
 * Not imported by the Next.js app — scripts only.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createProjectSchema, generateProjectSchemaName, getPublicClient } from '@aiflow/db';

const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url));
export const WEB_ROOT = resolve(SCRIPT_DIR, '..');
export const REPO_ROOT = resolve(WEB_ROOT, '../..');

const STATE_PATH = join(REPO_ROOT, '.local', 'dev-rag.json');

/** Persisted dogfood project pointer (gitignored via `.local/`). */
export interface DevRagState {
  schemaName: string;
  projectId: string;
}

/** Strip surrounding single/double quotes from an env value. */
export function unquote(val: string): string {
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    return val.slice(1, -1);
  }
  return val;
}

/** Parse one KEY=VALUE line; returns null for blanks/comments/malformed. */
export function parseEnvLine(line: string): { key: string; val: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const eq = trimmed.indexOf('=');
  if (eq < 1) return null;
  return { key: trimmed.slice(0, eq).trim(), val: unquote(trimmed.slice(eq + 1).trim()) };
}

/** Load KEY=VALUE lines from apps/web/.env.local when vars are unset. */
export function loadEnvLocal(): void {
  const path = join(WEB_ROOT, '.env.local');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    if (process.env[parsed.key] === undefined) process.env[parsed.key] = parsed.val;
  }
}

/** Read gitignored state file if present. */
export function readDevRagState(): DevRagState | null {
  if (!existsSync(STATE_PATH)) return null;
  try {
    const raw = JSON.parse(readFileSync(STATE_PATH, 'utf8')) as DevRagState;
    if (typeof raw.schemaName === 'string' && typeof raw.projectId === 'string') return raw;
  } catch {
    return null;
  }
  return null;
}

/** Persist schema/project ids for idempotent re-ingest. */
export function writeDevRagState(state: DevRagState): void {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

/** Repo-relative POSIX path for Document.title. */
export function toRepoRelPath(absPath: string): string {
  return relative(REPO_ROOT, absPath).split('\\').join('/');
}

/**
 * Resolve the stable dogfood schema: env override → state file → optional create.
 * Pass `createIfMissing: true` only from ingest; query/MCP must fail loudly.
 */
export async function resolveStableSchema(
  opts: { createIfMissing?: boolean } = {},
): Promise<DevRagState> {
  const createIfMissing = opts.createIfMissing === true;
  const fromEnv = process.env.DEV_RAG_SCHEMA_NAME?.trim();
  if (fromEnv) {
    const publicDb = getPublicClient();
    const existing = await publicDb.projectMeta.findFirst({
      where: { schemaName: fromEnv, deletedAt: null },
    });
    if (existing) return { schemaName: fromEnv, projectId: existing.id };
    throw new Error(`DEV_RAG_SCHEMA_NAME=${fromEnv} has no ProjectMeta row`);
  }

  const saved = readDevRagState();
  if (saved) {
    const publicDb = getPublicClient();
    const existing = await publicDb.projectMeta.findFirst({
      where: { schemaName: saved.schemaName, deletedAt: null },
    });
    if (existing) return { schemaName: saved.schemaName, projectId: existing.id };
  }

  if (!createIfMissing) {
    throw new Error('No dogfood RAG index — run: yarn workspace @aiflow/web docs:ingest');
  }
  return createFreshDevRagProject();
}

/** Create a new project schema and write `.local/dev-rag.json`. */
async function createFreshDevRagProject(): Promise<DevRagState> {
  const publicDb = getPublicClient();
  const owner = await publicDb.user.findFirst({ where: { deletedAt: null } });
  if (!owner) {
    throw new Error('No user in public.User — run: yarn workspace @aiflow/db seed:dev-user');
  }

  const schemaName = generateProjectSchemaName();
  await createProjectSchema(schemaName);
  const project = await publicDb.projectMeta.create({
    data: {
      name: 'Dev repo RAG',
      description: 'Stable dogfood index for Cursor/Claude agent MCP',
      schemaName,
      ownerId: owner.id,
      status: 'ACTIVE',
    },
  });
  const state = { schemaName, projectId: project.id };
  writeDevRagState(state);
  return state;
}
