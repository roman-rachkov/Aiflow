/**
 * Editor WebSocket JSON message types (SPEC Background processes).
 * Transport: `ws` package (MIT) on the custom Next server.
 */

/** Client → server envelopes. */
export type EditorClientMessage =
  | { type: 'editor.subscribe' }
  | { type: 'editor.dirty'; path: string }
  | { type: 'editor.cursor'; path?: string; line?: number; column?: number }
  | { type: 'terminal.attach' };

/** Server → client envelopes (also used by `publishEditorEvent`). */
export type EditorServerEvent =
  | { type: 'editor.fileOpened'; path: string }
  | { type: 'editor.saved'; path: string; commitSha: string }
  | { type: 'editor.treeChanged' }
  | { type: 'editor.error'; message: string }
  | { type: 'terminal.output'; chunk: string }
  | { type: 'terminal.ready' };

/** Auth / access rejection on the WS handshake (SPEC). */
export const WS_CLOSE_FORBIDDEN = 4403;

export function parseClientMessage(raw: string): EditorClientMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const type = (parsed as { type?: unknown }).type;
  if (typeof type !== 'string') return null;
  return normalizeClientMessage(type, parsed as Record<string, unknown>);
}

function normalizeClientMessage(
  type: string,
  raw: Record<string, unknown>,
): EditorClientMessage | null {
  if (type === 'editor.subscribe') return { type };
  if (type === 'terminal.attach') return { type };
  if (type === 'editor.dirty' && typeof raw.path === 'string') {
    return { type, path: raw.path };
  }
  if (type === 'editor.cursor') {
    return {
      type,
      path: typeof raw.path === 'string' ? raw.path : undefined,
      line: typeof raw.line === 'number' ? raw.line : undefined,
      column: typeof raw.column === 'number' ? raw.column : undefined,
    };
  }
  return null;
}
