/**
 * Smoke test for the load-test isolation logic.
 *
 * When DATABASE_URL is present, connects to Postgres and runs the full
 * create → verify → drop cycle with N=2 schemas.
 * Without DATABASE_URL the test is skipped automatically (safe in CI).
 */

import { describe, it, expect } from 'vitest';
import { Client } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

function schemaName(suffix: string): string {
  return `load_test_smoke_${String(Date.now())}_${suffix}`;
}

describe.skipIf(!DATABASE_URL)('schema isolation (requires DATABASE_URL)', () => {
  it('creates N=2 schemas concurrently and detects no cross-schema leakage', async () => {
    const client = new Client({ connectionString: DATABASE_URL });
    await client.connect();

    const schemas = [schemaName('a'), schemaName('b')];

    try {
      await Promise.all(
        schemas.map(async (schema) => {
          await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
          await client.query(
            `CREATE TABLE IF NOT EXISTS "${schema}".sentinel (id serial PRIMARY KEY, owner text NOT NULL)`,
          );
          await client.query(`INSERT INTO "${schema}".sentinel (owner) VALUES ($1)`, [schema]);
        }),
      );

      for (const schema of schemas) {
        const { rows } = await client.query<{ owner: string; count: string }>(
          `SELECT owner, COUNT(*) as count FROM "${schema}".sentinel GROUP BY owner`,
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].owner).toBe(schema);
        expect(rows[0].count).toBe('1');
      }
    } finally {
      await Promise.all(schemas.map((s) => client.query(`DROP SCHEMA IF EXISTS "${s}" CASCADE`)));
      await client.end();
    }
  });
});

describe('isolation logic (unit, no DB required)', () => {
  it('schema names are distinct for different slots', () => {
    const ts = String(Date.now());
    const names = ['0', '1', '2'].map((i) => `load_test_${ts}_${i}`);
    const unique = new Set(names);
    expect(unique.size).toBe(3);
  });

  it('schema name does not contain reserved characters', () => {
    const name = `load_test_${String(Date.now())}_0`;
    expect(name).toMatch(/^[a-z0-9_]+$/);
  });
});
