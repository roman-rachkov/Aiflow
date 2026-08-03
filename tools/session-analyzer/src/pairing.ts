import {
  findTranscripts,
  extractText,
  isToolResult,
  isToolUse,
  readEntries,
} from './transcript.ts';
import type { SessionSummary, ToolCall, TranscriptEntry } from './types.ts';

/**
 * Pair tool_use blocks with their tool_result blocks across every transcript.
 *
 * Deduplication is not optional. A resumed or forked session is written as a new
 * file that repeats the parent's entries verbatim — measured here, one transcript
 * shared 79 of its 80 entries with another. Globbing and summing double-counts
 * those calls and inflates every rate in the report
 * (docs/17-session-review.md § 2).
 */

export interface CollectResult {
  calls: ToolCall[];
  sessions: SessionSummary[];
  denials: Record<string, number>;
  fileCount: number;
  duplicateEntriesSkipped: number;
}

interface Pending {
  id: string;
  name: string;
  input: Record<string, unknown>;
  sessionId: string;
  timestamp: string;
}

/** Mutable accumulator threaded through the scan. */
class Accumulator {
  readonly calls: ToolCall[] = [];
  readonly denials: Record<string, number> = {};
  readonly sessions = new Map<string, SessionSummary>();
  duplicateEntriesSkipped = 0;

  private readonly seenEntry = new Set<string>();
  private readonly seenUse = new Set<string>();
  private readonly seenResult = new Set<string>();
  private readonly pending = new Map<string, Pending>();

  /** True when this entry is a verbatim repeat from a forked session. */
  isDuplicate(uuid: string | undefined): boolean {
    if (uuid === undefined) return false;
    if (this.seenEntry.has(uuid)) {
      this.duplicateEntriesSkipped += 1;
      return true;
    }
    this.seenEntry.add(uuid);
    return false;
  }

  noteSession(entry: TranscriptEntry, sessionId: string, timestamp: string): void {
    if (this.sessions.has(sessionId)) return;
    this.sessions.set(sessionId, {
      sessionId,
      slug: entry.slug ?? '',
      gitBranch: entry.gitBranch ?? '',
      startedAt: timestamp,
      toolCalls: 0,
      errors: 0,
    });
  }

  noteDenial(kind: string): void {
    this.denials[kind] = (this.denials[kind] ?? 0) + 1;
  }

  openCall(pending: Pending): void {
    if (this.seenUse.has(pending.id)) return;
    this.seenUse.add(pending.id);
    this.pending.set(pending.id, pending);
  }

  closeCall(toolUseId: string, isError: boolean, content: unknown): void {
    if (this.seenResult.has(toolUseId)) return;
    this.seenResult.add(toolUseId);
    const match = this.pending.get(toolUseId);
    if (!match) return;
    this.pending.delete(toolUseId);
    this.calls.push({
      id: match.id,
      name: match.name,
      input: match.input,
      sessionId: match.sessionId,
      timestamp: match.timestamp,
      isError,
      errorText: isError ? extractText(content) : '',
    });
  }

  /** A tool_use with no result means the session ended mid-flight; still a call. */
  flushPending(): void {
    for (const item of this.pending.values()) {
      this.calls.push({ ...item, isError: false, errorText: '' });
    }
    this.pending.clear();
  }

  summarize(): SessionSummary[] {
    for (const call of this.calls) {
      const session = this.sessions.get(call.sessionId);
      if (!session) continue;
      session.toolCalls += 1;
      if (call.isError) session.errors += 1;
    }
    return [...this.sessions.values()].sort((a, b) => b.toolCalls - a.toolCalls);
  }
}

function scanBlocks(
  entry: TranscriptEntry,
  sessionId: string,
  timestamp: string,
  acc: Accumulator,
): void {
  for (const block of entry.message?.content ?? []) {
    if (isToolUse(block)) {
      acc.openCall({ id: block.id, name: block.name, input: block.input, sessionId, timestamp });
    } else if (isToolResult(block)) {
      acc.closeCall(block.tool_use_id, block.is_error === true, block.content);
    }
  }
}

function scanEntry(entry: TranscriptEntry, cutoff: number, acc: Accumulator): void {
  if (acc.isDuplicate(entry.uuid)) return;

  const timestamp = entry.timestamp ?? '';
  if (cutoff > 0 && timestamp !== '' && Date.parse(timestamp) < cutoff) return;

  const sessionId = entry.sessionId ?? 'unknown';
  acc.noteSession(entry, sessionId, timestamp);
  if (entry.toolDenialKind !== undefined) acc.noteDenial(entry.toolDenialKind);
  scanBlocks(entry, sessionId, timestamp, acc);
}

export function collect(root: string, cutoff: number): CollectResult {
  const files = findTranscripts(root);
  const acc = new Accumulator();

  for (const file of files) {
    for (const entry of readEntries(file)) scanEntry(entry, cutoff, acc);
  }
  acc.flushPending();

  return {
    calls: acc.calls,
    sessions: acc.summarize(),
    denials: acc.denials,
    fileCount: files.length,
    duplicateEntriesSkipped: acc.duplicateEntriesSkipped,
  };
}
