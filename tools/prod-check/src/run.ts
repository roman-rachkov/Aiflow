import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '../../..');

const REQUIRED_ENV = [
  'ENCRYPTION_KEY',
  'AUTH_SECRET',
  'DATABASE_URL',
  'REDIS_URL',
  'GITEA_URL',
] as const;

type Check = { name: string; ok: boolean; detail?: string };

function checkFile(rel: string): Check {
  const path = join(ROOT, rel);
  const ok = existsSync(path);
  return { name: `file:${rel}`, ok, detail: ok ? undefined : 'missing' };
}

function checkEnvDocumented(key: string): Check {
  const example = readFileSync(join(ROOT, '.env.example'), 'utf8');
  const ok = example.includes(`${key}=`) || example.includes(`${key} `);
  return { name: `env-doc:${key}`, ok, detail: ok ? undefined : 'not in .env.example' };
}

function main(): void {
  const checks: Check[] = [
    checkFile('docker-compose.prod.yml'),
    checkFile('docs/prod-deployment.md'),
    ...REQUIRED_ENV.map((k) => checkEnvDocumented(k)),
  ];

  let failed = 0;
  for (const c of checks) {
    const mark = c.ok ? 'PASS' : 'FAIL';
    const detail = c.detail ? ` — ${c.detail}` : '';
    process.stdout.write(`${mark}  ${c.name}${detail}\n`);
    if (!c.ok) failed += 1;
  }

  if (failed > 0) process.exitCode = 1;
}

main();
