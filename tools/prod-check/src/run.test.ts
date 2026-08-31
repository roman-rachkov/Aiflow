import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '../../..');

describe('prod-check gate', () => {
  it('requires prod overlay and runbook', () => {
    expect(existsSync(join(ROOT, 'docker-compose.prod.yml'))).toBe(true);
    expect(existsSync(join(ROOT, 'docs/prod-deployment.md'))).toBe(true);
  });

  it('documents ENCRYPTION_KEY in .env.example', () => {
    const example = readFileSync(join(ROOT, '.env.example'), 'utf8');
    expect(example).toContain('ENCRYPTION_KEY');
  });
});
