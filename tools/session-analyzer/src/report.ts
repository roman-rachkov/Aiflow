import { findAntiPatterns, findThrash } from './thrash.ts';
import { findCapabilityGaps } from './gaps.ts';
import { buildTaxonomy } from './taxonomy.ts';
import type { Report, ToolCall, ToolStat } from './types.ts';

/** Assemble the final report from the flat list of paired tool calls. */

function byTool(calls: ToolCall[]): ToolStat[] {
  const stats = new Map<string, { calls: number; errors: number }>();
  for (const call of calls) {
    const stat = stats.get(call.name) ?? { calls: 0, errors: 0 };
    stat.calls += 1;
    if (call.isError) stat.errors += 1;
    stats.set(call.name, stat);
  }
  return [...stats.entries()]
    .map(([name, stat]) => ({
      name,
      calls: stat.calls,
      errors: stat.errors,
      errorRate: stat.calls === 0 ? 0 : Number((stat.errors / stat.calls).toFixed(3)),
    }))
    .sort((a, b) => b.calls - a.calls);
}

export interface BuildInput {
  calls: ToolCall[];
  sessions: Report['sessions'];
  denials: Record<string, number>;
  fileCount: number;
  duplicateEntriesSkipped: number;
  transcriptRoot: string;
  since: string;
}

export function buildReport(input: BuildInput): Report {
  const { calls } = input;
  const totalCalls = calls.length;
  const errors = calls.filter((c) => c.isError).length;
  const taxonomy = buildTaxonomy(calls);
  const environmentErrors = taxonomy
    .filter((b) => !b.ourProblem)
    .reduce((sum, b) => sum + b.count, 0);
  const ourErrors = errors - environmentErrors;

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      since: input.since,
      transcriptRoot: input.transcriptRoot,
      fileCount: input.fileCount,
      duplicateEntriesSkipped: input.duplicateEntriesSkipped,
    },
    overall: {
      sessions: input.sessions.length,
      toolCalls: totalCalls,
      errors,
      errorRate: totalCalls === 0 ? 0 : Number((errors / totalCalls).toFixed(3)),
      ourErrors,
      environmentErrors,
    },
    sessions: input.sessions,
    byTool: byTool(calls),
    taxonomy,
    denials: input.denials,
    thrash: findThrash(calls),
    antiPatterns: findAntiPatterns(calls),
    capabilityGaps: findCapabilityGaps(calls),
  };
}
