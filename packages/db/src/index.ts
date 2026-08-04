import { PrismaClient as PublicClient } from '../generated/public';
import { PrismaClient as ProjectClient } from '../generated/project';

// Re-export the typed wrappers for the Json config columns so consumers go
// through them rather than writing arbitrary JSON to ModelConfig.config /
// EmbeddedAgent.config. See ./config-types.ts.
export type { AgentConfigValue, EncryptedValue, ModelConfigValue } from './config-types';
export { asEncryptedValue } from './config-types';

/**
 * Data access for the two-schema split described in docs/03-data-model.md.
 *
 * `public` holds users and project metadata and has exactly one client.
 * Every project gets its own PostgreSQL schema (`project_{uuid}`) reached
 * through a separate client whose connection string names that schema — the
 * hard isolation boundary the platform is built on.
 */

const PROJECT_SCHEMA_PATTERN = /^project_[a-z0-9_]+$/;

/**
 * Cached per schema. This is a `Map`, not a `WeakMap`: an earlier revision of
 * the design specified `WeakMap`, which cannot work here at all — its keys must
 * be objects, so `.set(schemaName, client)` with a string throws at runtime.
 * Resolved as C1 in docs/14-decisions-needed.md.
 *
 * The consequence of a `Map` is that entries are held until evicted, so
 * `evictProjectClient` is not an optimisation — it is required on project
 * archive or delete, or connections leak for the process lifetime.
 */
const projectClients = new Map<string, ProjectClient>();

let publicClient: PublicClient | undefined;

/** The `public` schema client. One per process. */
export function getPublicClient(): PublicClient {
  publicClient ??= new PublicClient();
  return publicClient;
}

function projectUrl(schemaName: string): string {
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) throw new Error('DATABASE_URL is not set');

  const url = new URL(baseUrl);
  // Replace rather than append: the base URL already carries `schema=public`,
  // and a duplicate parameter is resolved differently by different drivers.
  url.searchParams.set('schema', schemaName);
  return url.toString();
}

/**
 * Client for one project's schema, cached by schema name.
 *
 * The name is validated before it reaches the connection string. It arrives
 * from `ProjectMeta.schemaName`, which the platform generates, but this
 * function is the last point where an injected value could still become part
 * of a connection URL — so it is checked here rather than trusted upstream.
 */
export function getProjectClient(schemaName: string): ProjectClient {
  if (!PROJECT_SCHEMA_PATTERN.test(schemaName)) {
    throw new Error(`Invalid project schema name: ${schemaName}`);
  }

  const cached = projectClients.get(schemaName);
  if (cached) return cached;

  const client = new ProjectClient({ datasources: { db: { url: projectUrl(schemaName) } } });
  projectClients.set(schemaName, client);
  return client;
}

/** Disconnect and drop a project's client. Call on archive or delete. */
export async function evictProjectClient(schemaName: string): Promise<void> {
  const client = projectClients.get(schemaName);
  if (!client) return;

  projectClients.delete(schemaName);
  await client.$disconnect();
}

/** Disconnect everything. For process shutdown and test teardown. */
export async function disconnectAll(): Promise<void> {
  const clients = [...projectClients.values()];
  projectClients.clear();

  await Promise.all(clients.map((c) => c.$disconnect()));
  await publicClient?.$disconnect();
  publicClient = undefined;
}

/** Exposed for tests: how many project clients are currently held. */
export function cachedProjectClientCount(): number {
  return projectClients.size;
}

export { PROJECT_SCHEMA_PATTERN };
