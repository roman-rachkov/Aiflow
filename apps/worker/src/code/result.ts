/**
 * Parse sandbox runner RESULT JSON from multiplexed container logs.
 */

export type SandboxResult = {
  status: 'success' | 'failure';
  task?: string;
  diff?: string;
  report?: string;
};

/** Find `=== RESULT ===` then parse the following JSON object line. */
export function parseResultFromLogs(logs: string): SandboxResult | null {
  const marker = '=== RESULT ===';
  const idx = logs.lastIndexOf(marker);
  if (idx < 0) return null;
  const after = logs.slice(idx + marker.length).trim();
  const line = after.split('\n').find((l) => l.trim().startsWith('{'));
  if (!line) return null;
  try {
    const parsed = JSON.parse(line) as { status?: unknown };
    if (parsed.status !== 'success' && parsed.status !== 'failure') return null;
    return parsed as SandboxResult;
  } catch {
    return null;
  }
}
