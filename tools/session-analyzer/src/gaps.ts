import type { CapabilityGap, ToolCall } from './types.ts';

/**
 * What the toolset is missing, measured rather than guessed.
 *
 * A call to a tool that does not exist is the agent stating a requirement: it
 * expected a capability and the environment had none. Measured here, PowerShell
 * was attempted 10 times on a Windows host. Those attempts are the empirical
 * answer to "what is missing to make this IDE grown up", and each repeated one
 * earns a row in docs/13-agent-tooling.md rather than a workaround
 * (docs/17-session-review.md § 3.4).
 */

const MISSING_TOOL = /No such tool available:\s*([\w-]+)/i;

export function findCapabilityGaps(calls: ToolCall[]): CapabilityGap[] {
  const attempts = new Map<string, number>();

  for (const call of calls) {
    if (!call.isError) continue;
    const candidate = MISSING_TOOL.exec(call.errorText)?.[1];
    if (candidate === undefined) continue;
    attempts.set(candidate, (attempts.get(candidate) ?? 0) + 1);
  }

  return [...attempts.entries()]
    .map(([candidate, count]) => ({ candidate, attempts: count }))
    .sort((a, b) => b.attempts - a.attempts);
}
