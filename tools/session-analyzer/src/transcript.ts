import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ContentBlock, ToolResultBlock, ToolUseBlock, TranscriptEntry } from './types.ts';

/**
 * The parse boundary. Transcripts are external, undocumented, and occasionally
 * truncated mid-write, so every narrowing happens here and nowhere else — a
 * malformed line is skipped, never allowed to abort a run.
 */

export function isToolUse(block: ContentBlock): block is ToolUseBlock {
  const candidate = block as Partial<ToolUseBlock>;
  return (
    block.type === 'tool_use' &&
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string'
  );
}

export function isToolResult(block: ContentBlock): block is ToolResultBlock {
  return (
    block.type === 'tool_result' &&
    typeof (block as Partial<ToolResultBlock>).tool_use_id === 'string'
  );
}

/** Recursively collect .jsonl files, including the subagents/ subdirectories. */
export function findTranscripts(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) out.push(...findTranscripts(path));
    else if (entry.name.endsWith('.jsonl')) out.push(path);
  }
  return out;
}

function parseLine(line: string): TranscriptEntry | null {
  try {
    const parsed: unknown = JSON.parse(line);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed;
  } catch {
    // A truncated final line is normal in a live session, not an error.
    return null;
  }
}

export function readEntries(file: string): TranscriptEntry[] {
  const out: TranscriptEntry[] = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    const entry = parseLine(line);
    if (entry) out.push(entry);
  }
  return out;
}

/** Convert `7d` / `24h` / `30d` / `all` into a cutoff timestamp. */
export function parseSince(since: string): number {
  if (since === 'all') return 0;
  const match = /^(\d+)([hd])$/.exec(since);
  if (!match) throw new Error(`Invalid --since value: ${since} (expected 7d, 24h, 30d, or all)`);
  const amount = Number(match[1]);
  const hours = match[2] === 'h' ? amount : amount * 24;
  return Date.now() - hours * 60 * 60 * 1000;
}

export function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(extractText).join(' ');
  if (typeof content === 'object' && content !== null && 'text' in content) {
    return String(content.text);
  }
  return '';
}
