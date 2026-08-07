import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { readApiKey, shouldCommit } = require('./runner-gate.js') as {
  readApiKey: (path?: string) => string;
  shouldCommit: (gates: {
    ts: boolean;
    lint: boolean;
    prettier: boolean;
    prisma: boolean;
  }) => boolean;
};

describe('readApiKey', () => {
  it('reads trimmed key from secret file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiflow-secret-'));
    const file = path.join(dir, 'api_key');
    fs.writeFileSync(file, '  sk-test-key  \n');
    expect(readApiKey(file)).toBe('sk-test-key');
  });

  it('throws when file is missing', () => {
    expect(() => readApiKey('/no/such/api_key')).toThrow(/missing/);
  });

  it('throws when file is empty', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiflow-secret-'));
    const file = path.join(dir, 'api_key');
    fs.writeFileSync(file, '   \n');
    expect(() => readApiKey(file)).toThrow(/empty/);
  });
});

describe('shouldCommit', () => {
  it('is true only when every gate passed', () => {
    expect(shouldCommit({ ts: true, lint: true, prettier: true, prisma: true })).toBe(true);
  });

  it('is false when any gate failed', () => {
    expect(shouldCommit({ ts: true, lint: false, prettier: true, prisma: true })).toBe(false);
    expect(shouldCommit({ ts: true, lint: true, prettier: false, prisma: true })).toBe(false);
  });
});
