/**
 * Write API key to a temp file for `/run/secrets/api_key` bind mount.
 * MVP: OPENAI_API_KEY from worker env (ModelConfig decrypt deferred).
 */

import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type ApiKeySecret = {
  dir: string;
  filePath: string;
};

/** Resolve plaintext key from env; throws if missing. */
export function resolveApiKey(env: NodeJS.ProcessEnv = process.env): string {
  const key = env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error('OPENAI_API_KEY is not set');
  return key;
}

/** Create a temp dir + api_key file; caller must removeSecretDir. */
export async function writeApiKeySecret(
  apiKey: string,
  baseDir = process.env.WORKER_TEMP_DIR ?? tmpdir(),
): Promise<ApiKeySecret> {
  const dir = await mkdtemp(join(baseDir, 'sandbox-secret-'));
  const filePath = join(dir, 'api_key');
  await writeFile(filePath, apiKey, { mode: 0o600 });
  return { dir, filePath };
}

export async function removeSecretDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}
