/**
 * AI Studio — Concurrency + Isolation Load Test (MVP2-52)
 *
 * Creates N=3 project schemas concurrently in PostgreSQL, writes a sentinel row
 * to each, then verifies cross-schema isolation (no schema can read another's
 * sentinel). Finally, it tears down the test schemas.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... tsx tools/load-test/src/run.mts [--concurrency 3]
 *
 * The script exits 0 on success, non-zero on any isolation failure or error.
 *
 * Prerequisites: a running PostgreSQL instance whose DATABASE_URL is set.
 * In the compose stack: docker compose exec app tsx tools/load-test/src/run.mts
 */

import { Client } from 'pg';

const CONCURRENCY = (() => {
  const idx = process.argv.indexOf('--concurrency');
  const val = idx !== -1 ? parseInt(process.argv[idx + 1] ?? '3', 10) : 3;
  return Number.isFinite(val) && val > 0 ? val : 3;
})();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

/** Unique schema name for each parallel slot. */
function schemaName(slot: number): string {
  return `load_test_${String(Date.now())}_${String(slot)}`;
}

async function createSchema(client: Client, schema: string): Promise<void> {
  await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  await client.query(
    `CREATE TABLE IF NOT EXISTS "${schema}".sentinel (id serial PRIMARY KEY, owner text NOT NULL)`,
  );
  await client.query(`INSERT INTO "${schema}".sentinel (owner) VALUES ($1)`, [schema]);
}

async function verifyIsolation(client: Client, schemas: string[]): Promise<void> {
  for (const schema of schemas) {
    const { rows } = await client.query<{ owner: string; count: string }>(
      `SELECT owner, COUNT(*) as count FROM "${schema}".sentinel GROUP BY owner`,
    );
    if (rows.length !== 1) {
      throw new Error(`Schema ${schema}: expected exactly 1 owner row, got ${String(rows.length)}`);
    }
    if (rows[0].owner !== schema) {
      throw new Error(`Isolation breach: schema=${schema} but sentinel.owner=${rows[0].owner}`);
    }
    if (rows[0].count !== '1') {
      throw new Error(`Schema ${schema}: expected 1 sentinel row, got ${rows[0].count}`);
    }
  }
}

async function dropSchema(client: Client, schema: string): Promise<void> {
  await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
}

async function main(): Promise<void> {
  console.log(`Load test — ${String(CONCURRENCY)} concurrent project schemas`);

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  const schemas = Array.from({ length: CONCURRENCY }, (_, i) => schemaName(i));

  try {
    console.log('Creating schemas concurrently:', schemas);
    await Promise.all(schemas.map((s) => createSchema(client, s)));

    console.log('Verifying isolation...');
    await verifyIsolation(client, schemas);

    console.log('✓ Isolation verified — no cross-schema leakage detected');
  } finally {
    console.log('Dropping test schemas...');
    await Promise.all(schemas.map((s) => dropSchema(client, s)));
    await client.end();
  }

  console.log('Load test completed successfully.');
}

main().catch((err: unknown) => {
  console.error('Load test FAILED:', err);
  process.exit(1);
});
