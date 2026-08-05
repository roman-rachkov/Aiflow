import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createProjectSchema, dropProjectSchema } from './schema-executor';

// A fake pg.Client backed by shared vi.fn()s, so each function's call sequence
// can be asserted. Both executor functions create a Client per call.
// `query` is typed so `mock.calls.map(c => c[0])` yields `string`, not `any`
// (no-unsafe-return is an error under strict-type-checked).
const connect = vi.fn();
const query = vi.fn<(sql: string) => Promise<void>>();
const end = vi.fn();

vi.mock('pg', () => ({
  Client: class {
    connect = connect;
    query = query;
    end = end;
  },
}));

// generateProjectSql shells out to `prisma migrate diff`; stubbing the module
// keeps these tests about the transaction flow, not about the SQL content.
vi.mock('./project-schema', () => ({
  assertValidSchemaName: (name: string) => {
    if (!/^project_[a-z0-9_]+$/.test(name)) throw new Error(`Invalid schema name: ${name}`);
  },
  generateProjectSql: (name: string) => `-- sql for ${name}`,
}));

// The fake Client never connects, but the executor builds its connection string
// from DATABASE_URL before constructing the client — so a syntactically valid
// value must exist. Same pattern as client.test.ts.
beforeAll(() => {
  process.env.DATABASE_URL ??=
    'postgresql://ai_studio:ai_studio@localhost:5432/ai_studio?schema=public';
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('createProjectSchema', () => {
  it('runs the script inside a BEGIN/COMMIT transaction on one connection', async () => {
    await createProjectSchema('project_x');

    expect(connect).toHaveBeenCalledTimes(1);
    expect(query.mock.calls.map((c) => c[0])).toEqual(['BEGIN', '-- sql for project_x', 'COMMIT']);
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('issues ROLLBACK and rethrows when the script fails', async () => {
    const boom = new Error('ddl failed');
    // The executor awaits `client.query('ROLLBACK').catch(...)`, so the mock
    // must return promises here — undefined would fail the `.catch` access.
    query
      .mockImplementationOnce(() => Promise.resolve()) // BEGIN
      .mockImplementationOnce(() => Promise.reject(boom)) // the script
      .mockImplementationOnce(() => Promise.resolve()); // ROLLBACK

    await expect(createProjectSchema('project_x')).rejects.toThrow('ddl failed');
    expect(query.mock.calls.map((c) => c[0])).toEqual([
      'BEGIN',
      '-- sql for project_x',
      'ROLLBACK',
    ]);
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('throws on an invalid name before opening any connection', async () => {
    await expect(createProjectSchema('public')).rejects.toThrow(/Invalid schema name/);
    expect(connect).not.toHaveBeenCalled();
  });
});

describe('dropProjectSchema', () => {
  it('drops the schema CASCADE', async () => {
    await dropProjectSchema('project_x');

    expect(connect).toHaveBeenCalledTimes(1);
    expect(query.mock.calls.map((c) => c[0])).toEqual([
      'DROP SCHEMA IF EXISTS "project_x" CASCADE',
    ]);
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('throws on an invalid name before opening any connection', async () => {
    await expect(dropProjectSchema('project-abc')).rejects.toThrow(/Invalid schema name/);
    expect(connect).not.toHaveBeenCalled();
  });
});
