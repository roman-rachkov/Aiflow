import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * These tests guard the two-schema split described in docs/03-data-model.md § 2
 * and the generator-output collision resolved as C2 in
 * docs/14-decisions-needed.md. They read the .prisma files as text on purpose:
 * the point is to catch an edit that silently breaks an architectural
 * invariant, which is exactly the class of mistake a generated client would
 * hide until runtime.
 */
const prismaDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'prisma');
const read = (file: string) => readFileSync(join(prismaDir, file), 'utf8');

describe('public schema', () => {
  const schema = read('schema.prisma');

  it('holds only shared platform models', () => {
    const models = [...schema.matchAll(/^model\s+(\w+)/gm)].map((m) => m[1]).sort();
    expect(models).toEqual([
      'Account',
      'AuditEvent',
      'DeploymentMeta',
      'ProjectMeta',
      'Session',
      'User',
      'VerificationToken',
    ]);
  });

  it('defines append-only AuditEvent without soft-delete (MVP-3 A3)', () => {
    expect(schema).toMatch(/model\s+AuditEvent\s*\{/);
    expect(schema).toMatch(/enum\s+AuditActorRole/);
    const auditBlock = schema.slice(schema.indexOf('model AuditEvent'));
    const body = auditBlock.slice(0, auditBlock.indexOf('\n}'));
    expect(body).not.toMatch(/deletedAt/);
    expect(body).toMatch(/langfuseTraceId/);
  });

  it('generates into its own output directory (C2)', () => {
    expect(schema).toMatch(/output\s*=\s*"\.\.\/generated\/public"/);
  });

  it('reads its connection string from the environment', () => {
    expect(schema).toMatch(/url\s*=\s*env\("DATABASE_URL"\)/);
  });
});

describe('project template schema', () => {
  const template = read('schema_project_template.prisma');

  it('does not collide with the public generator output (C2)', () => {
    const output = template.match(/output\s*=\s*"([^"]+)"/)?.[1];
    expect(output).toBeDefined();
    expect(output).not.toBe('../generated/public');
  });

  it('does not redefine shared platform models', () => {
    const models = [...template.matchAll(/^model\s+(\w+)/gm)].map((m) => m[1]);
    expect(models).not.toContain('User');
    expect(models).not.toContain('ProjectMeta');
  });
});
