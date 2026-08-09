/**
 * One-off backfill: apply the thread-schema shape (ChatThread table + threadId /
 * parentId columns) to every existing project schema, then seed a "Главный"
 * thread per project and link orphan messages to it.
 *
 * Idempotent — safe to re-run. New projects get the shape via createProjectSchema
 * and are a no-op here. Run once after deploying the thread model:
 *   docker compose exec app yarn workspace @aiflow/db backfill:threads
 */
import { ensureThreadSchema, getPublicClient } from '../src/index';

async function main(): Promise<void> {
  const pub = getPublicClient();
  const metas = await pub.projectMeta.findMany({
    where: { deletedAt: null },
    select: { schemaName: true },
  });
  console.log(`[backfill-threads] schemas to backfill: ${String(metas.length)}`);
  let ok = 0;
  let fail = 0;
  for (const m of metas) {
    try {
      await ensureThreadSchema(m.schemaName);
      console.log(`  ok   ${m.schemaName}`);
      ok += 1;
    } catch (e: unknown) {
      const detail = e instanceof Error ? e.message : String(e);
      console.log(`  FAIL ${m.schemaName} — ${detail}`);
      fail += 1;
    }
  }
  await pub.$disconnect();
  console.log(`[backfill-threads] done: ${String(ok)} ok, ${String(fail)} failed`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
