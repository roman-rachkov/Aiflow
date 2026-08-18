import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ensureUserTemplate } from './seed-template';

describe('ensureUserTemplate', () => {
  it('returns false when package.json already exists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'seed-'));
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'package.json'), '{"name":"x"}\n');
    await expect(ensureUserTemplate(dir, 'Demo')).resolves.toBe(false);
  });
});
