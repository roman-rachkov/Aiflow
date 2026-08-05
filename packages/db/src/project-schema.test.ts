import { describe, expect, it, vi } from 'vitest';

import * as projectSchema from './project-schema';

// renderTableDdl shells out to `prisma migrate diff` via execFileSync. Stub the
// child-process call (not the module's own export) so these tests stay a pure
// string-shape test and never spawn a process — this also works regardless of
// how the module resolves its own internal reference to renderTableDdl.
vi.mock('node:child_process', () => ({
  execFileSync: () => '-- tables',
}));

describe('generateProjectSchemaName', () => {
  it('returns project_ followed by 32 lowercase hex chars', () => {
    expect(projectSchema.generateProjectSchemaName()).toMatch(/^project_[a-f0-9]{32}$/);
  });

  it('produces distinct names across calls', () => {
    const a = projectSchema.generateProjectSchemaName();
    const b = projectSchema.generateProjectSchemaName();
    expect(a).not.toBe(b);
  });
});

describe('generateProjectSql', () => {
  it('renders CREATE SCHEMA and the search_path sandwich', () => {
    const sql = projectSchema.generateProjectSql('project_abc');

    expect(sql).toContain('CREATE SCHEMA IF NOT EXISTS "project_abc";');
    // search_path keeps `public` so extension types (pgvector's vector) resolve.
    expect(sql).toContain('SET search_path TO "project_abc", public;');
    expect(sql).toContain('-- tables');
    expect(sql).toContain('RESET search_path;');
  });

  it('includes the pgvector column and the HNSW index', () => {
    const sql = projectSchema.generateProjectSql('project_vec');

    expect(sql).toContain('embedding vector(1536)');
    expect(sql).toContain('DocumentChunk_embedding_idx');
    expect(sql).toContain('USING hnsw');
  });

  it.each(['public', 'project-abc', 'Project_ABC', 'proj_abc', ''])(
    'rejects an invalid schema name: %s',
    (name) => {
      expect(() => projectSchema.generateProjectSql(name)).toThrow(/Invalid schema name/);
    },
  );
});
