import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { collect } from './pairing.ts';
import { parseSince } from './transcript.ts';
import { buildReport } from './report.ts';

/**
 * Usage:
 *   npx tsx src/cli.ts [--since 7d|24h|30d|all] [--project D--work-AIFlow] [--out path]
 *
 * Defaults to this project's transcripts, all time. Prints JSON to stdout, or to
 * --out. The slash command that consumes this is /session-review.
 */

interface Args {
  since: string;
  project: string;
  out: string | null;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { since: 'all', project: 'D--work-AIFlow', out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--since') args.since = argv[i + 1] ?? args.since;
    else if (arg === '--project') args.project = argv[i + 1] ?? args.project;
    else if (arg === '--out') args.out = argv[i + 1] ?? null;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const transcriptRoot = join(homedir(), '.claude', 'projects', args.project);
const cutoff = parseSince(args.since);
const collected = collect(transcriptRoot, cutoff);
const report = buildReport({
  calls: collected.calls,
  sessions: collected.sessions,
  denials: collected.denials,
  fileCount: collected.fileCount,
  duplicateEntriesSkipped: collected.duplicateEntriesSkipped,
  transcriptRoot,
  since: args.since,
});

const json = JSON.stringify(report, null, 2);
if (args.out === null) {
  process.stdout.write(`${json}\n`);
} else {
  writeFileSync(args.out, json);
  process.stdout.write(`Wrote report to ${args.out}\n`);
}
