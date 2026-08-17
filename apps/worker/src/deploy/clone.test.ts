import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildCloneUrl } from './clone';

beforeEach(() => {
  process.env.GITEA_URL = 'http://gitea:3000';
  delete process.env.GITEA_ADMIN_TOKEN;
  delete process.env.GITEA_ADMIN_TOKEN_FILE;
});

afterEach(() => {
  delete process.env.GITEA_URL;
  delete process.env.GITEA_ADMIN_TOKEN;
  delete process.env.GITEA_ADMIN_TOKEN_FILE;
});

describe('buildCloneUrl', () => {
  it('embeds the token-file credential in the clone URL', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gitea-token-'));
    const file = join(dir, 'token');
    writeFileSync(file, 'file-token\n');
    process.env.GITEA_ADMIN_TOKEN_FILE = file;

    expect(buildCloneUrl('aistudio', 'app')).toBe(
      'http://oauth2:file-token@gitea:3000/aistudio/app.git',
    );
  });

  it('throws when no token is configured', () => {
    expect(() => buildCloneUrl('aistudio', 'app')).toThrow(/GITEA_ADMIN_TOKEN/);
  });
});
