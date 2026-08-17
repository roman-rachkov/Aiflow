import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readGiteaAdminToken } from './gitea-token';

const ENV_TOKEN = 'env-admin-token';
const FILE_TOKEN = 'file-admin-token';

let tokenFile: string;

beforeEach(() => {
  const tokenDir = mkdtempSync(join(tmpdir(), 'gitea-token-'));
  tokenFile = join(tokenDir, 'token');
  process.env.GITEA_ADMIN_TOKEN = ENV_TOKEN;
  delete process.env.GITEA_ADMIN_TOKEN_FILE;
});

afterEach(() => {
  delete process.env.GITEA_ADMIN_TOKEN;
  delete process.env.GITEA_ADMIN_TOKEN_FILE;
});

describe('readGiteaAdminToken', () => {
  it('prefers a non-empty token file over env', () => {
    writeFileSync(tokenFile, `${FILE_TOKEN}\n`);
    process.env.GITEA_ADMIN_TOKEN_FILE = tokenFile;
    expect(readGiteaAdminToken()).toBe(FILE_TOKEN);
  });

  it('uses env when the file is missing', () => {
    process.env.GITEA_ADMIN_TOKEN_FILE = join(tokenFile, 'nope');
    expect(readGiteaAdminToken()).toBe(ENV_TOKEN);
  });
});
