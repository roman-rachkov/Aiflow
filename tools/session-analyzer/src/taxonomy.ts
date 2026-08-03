import type { TaxonomyBucket, ToolCall } from './types.ts';

/**
 * Classify tool errors, and mark which ones we can actually fix.
 *
 * The `ourProblem` flag is the point of this module. Measured over the corpus,
 * ~74% of errors are the permission classifier being unavailable — environmental
 * noise no code change on our side addresses. Reporting a flat error rate buries
 * the ~40 actionable failures under ~180 that are not
 * (docs/17-session-review.md § 3.1).
 *
 * Order matters: the first matching rule wins, so specific patterns precede
 * general ones.
 */

interface Rule {
  bucket: string;
  ourProblem: boolean;
  test: RegExp;
}

const RULES: Rule[] = [
  // Environment: the permission classifier could not be reached.
  {
    bucket: 'model-unavailable',
    ourProblem: false,
    test: /auto mode cannot determine|is temporarily unavailable/i,
  },
  {
    bucket: 'subagent-api-error',
    ourProblem: false,
    test: /Agent terminated early due to an API error/i,
  },

  // Ours: the toolset lacks something on this platform.
  { bucket: 'missing-tool', ourProblem: true, test: /No such tool available/i },

  // Ours: protocol violated — the harness told us the required order.
  { bucket: 'protocol-misuse', ourProblem: true, test: /has not been read yet|Read it first/i },

  // Ours: a guessed path.
  {
    bucket: 'path-not-found',
    ourProblem: true,
    test: /File does not exist|no such file or directory|cannot access/i,
  },

  // Ours: scope too wide.
  { bucket: 'timeout', ourProblem: true, test: /timed out/i },

  // Ours: the user declined what we proposed.
  {
    bucket: 'user-rejected',
    ourProblem: true,
    test: /user doesn't want to proceed|user rejected/i,
  },

  // Partly ours: allowlist tuning.
  {
    bucket: 'permission-denied',
    ourProblem: true,
    test: /[Pp]ermission .*(denied|blocked)|requires approval/i,
  },
];

export function classify(errorText: string): Rule {
  for (const rule of RULES) {
    if (rule.test.test(errorText)) return rule;
  }
  return { bucket: 'command-failure', ourProblem: true, test: /(?:)/ };
}

/** Collapse an error message to a stable signature for counting repeats. */
export function signature(errorText: string): string {
  return errorText
    .replace(/\s+/g, ' ')
    .replace(/<\/?tool_use_error>/g, '')
    .trim()
    .slice(0, 80);
}

export function buildTaxonomy(calls: ToolCall[]): TaxonomyBucket[] {
  const errors = calls.filter((c) => c.isError);
  const buckets = new Map<
    string,
    { ourProblem: boolean; count: number; sigs: Map<string, number> }
  >();

  for (const call of errors) {
    const rule = classify(call.errorText);
    let bucket = buckets.get(rule.bucket);
    if (!bucket) {
      bucket = { ourProblem: rule.ourProblem, count: 0, sigs: new Map() };
      buckets.set(rule.bucket, bucket);
    }
    bucket.count += 1;
    const sig = signature(call.errorText);
    bucket.sigs.set(sig, (bucket.sigs.get(sig) ?? 0) + 1);
  }

  return [...buckets.entries()]
    .map(([name, data]) => ({
      bucket: name,
      count: data.count,
      share: errors.length === 0 ? 0 : Number((data.count / errors.length).toFixed(3)),
      ourProblem: data.ourProblem,
      topSignatures: [...data.sigs.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([sig, count]) => ({ signature: sig, count })),
    }))
    .sort((a, b) => b.count - a.count);
}
