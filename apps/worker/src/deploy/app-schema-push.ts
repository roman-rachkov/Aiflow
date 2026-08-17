/**
 * Apply the generated user-app Prisma schema via `prisma db push` into a
 * dedicated `app_{hex}` schema — never onto `project_{uuid}` (OQ #2).
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { appDatabaseUrl, ensureAppSchema } from '@aiflow/db';

const execFileAsync = promisify(execFile);

export type PushAppSchemaResult = {
  appSchema: string;
  skipped: boolean;
};

/** db push when prisma/schema.prisma exists; otherwise skip. */
export async function pushUserAppSchema(
  workDir: string,
  projectSchema: string,
): Promise<PushAppSchemaResult> {
  const schemaPath = join(workDir, 'prisma', 'schema.prisma');
  if (!existsSync(schemaPath)) {
    return { appSchema: '', skipped: true };
  }
  const appSchema = await ensureAppSchema(projectSchema);
  const prismaCli = resolvePrismaCli();
  await execFileAsync(
    'node',
    [prismaCli, 'db', 'push', '--schema', schemaPath, '--skip-generate'],
    {
      cwd: workDir,
      timeout: 120_000,
      env: { ...process.env, DATABASE_URL: appDatabaseUrl(projectSchema) },
    },
  );
  return { appSchema, skipped: false };
}

function resolvePrismaCli(): string {
  const candidates = [
    join('/workspace', 'node_modules', 'prisma', 'build', 'index.js'),
    join(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js'),
  ];
  const found = candidates.find((path) => existsSync(path));
  if (!found) throw new Error('prisma CLI not found for db push');
  return found;
}
