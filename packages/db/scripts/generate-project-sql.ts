/**
 * CLI entry point for the project-schema SQL generator.
 *
 * The generator itself lives in `src/project-schema.ts` — it is importable at
 * runtime by `schema-executor.ts`. This script exists so the same SQL can also
 * be rendered by hand, to stdout or a file:
 *   tsx scripts/generate-project-sql.ts <schema_name> [--out <file>]
 */
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { generateProjectSql } from '../src/project-schema';

function main(): void {
  const [schemaName, ...rest] = process.argv.slice(2);
  if (!schemaName) {
    console.error('Usage: tsx scripts/generate-project-sql.ts <schema_name> [--out <file>]');
    process.exit(1);
  }

  const sql = generateProjectSql(schemaName);
  const outFlag = rest.indexOf('--out');

  if (outFlag !== -1) {
    const target = rest[outFlag + 1];
    if (!target) throw new Error('--out requires a file path');

    writeFileSync(target, sql);
    console.error(`Wrote ${target}`);
  } else {
    process.stdout.write(sql);
  }
}

// Only run when invoked directly, so the wrapper stays importable.
//
// `pathToFileURL`, not string concatenation: on Windows `import.meta.url` is
// `file:///D:/...` (three slashes) while a hand-built `file://` + path gives
// two, so the naive comparison silently never matches and main() never runs.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
