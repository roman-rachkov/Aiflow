import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getConfig, readAdminToken } from './http';

const ENV_TOKEN = 'env-admin-token';
const FILE_TOKEN = 'file-admin-token';

let tokenDir: string;
let tokenFile: string;

beforeEach(() => {
  tokenDir = mkdtempSync(join(tmpdir(), 'gitea-token-'));
  tokenFile = join(tokenDir, 'token');
  process.env.GITEA_URL = 'http://gitea.test';
  process.env.GITEA_ADMIN_TOKEN = ENV_TOKEN;
  delete process.env.GITEA_ADMIN_TOKEN_FILE;
});

afterEach(() => {
  delete process.env.GITEA_ADMIN_TOKEN;
  delete process.env.GITEA_ADMIN_TOKEN_FILE;
  delete process.env.GITEA_URL;
});

describe('readAdminToken', () => {
  it('prefers a non-empty token file over env', () => {
    writeFileSync(tokenFile, ` ${FILE_TOKEN}\n`);
    process.env.GITEA_ADMIN_TOKEN_FILE = tokenFile;
    expect(readAdminToken()).toBe(FILE_TOKEN);
  });

  it('falls through to env when the file is empty or missing', () => {
    writeFileSync(tokenFile, '  \n');
    process.env.GITEA_ADMIN_TOKEN_FILE = tokenFile;
    expect(readAdminToken()).toBe(ENV_TOKEN);

    process.env.GITEA_ADMIN_TOKEN_FILE = join(tokenDir, 'missing');
    expect(readAdminToken()).toBe(ENV_TOKEN);
  });
});

describe('getConfig', () => {
  it('throws when neither file nor env token is set', () => {
    delete process.env.GITEA_ADMIN_TOKEN;
    expect(() => getConfig()).toThrow(/GITEA_ADMIN_TOKEN/);
  });
});
