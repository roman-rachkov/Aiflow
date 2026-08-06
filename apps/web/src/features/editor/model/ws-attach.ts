/**
 * Attach an authenticated editor WebSocket: Pro + project access, hub register,
 * and client message handling. Called from `apps/web/server.ts` after upgrade.
 *
 * License: transport uses the `ws` package (MIT).
 */
import type { IncomingMessage } from 'node:http';

import type { RawData, WebSocket } from 'ws';

import { resolveEditorContext } from './access';
import { sessionFromUpgrade } from './ws-auth';
import { fanOutRaw, registerEditorSocket, unregisterEditorSocket } from './ws-hub';
import { parseClientMessage, WS_CLOSE_FORBIDDEN } from './ws-protocol';

type Conn = { socket: WebSocket; projectId: string; userId: string };

/** Handshake + message loop for one editor WS connection. */
export async function attachEditorWebSocket(
  socket: WebSocket,
  req: IncomingMessage,
  projectId: string,
): Promise<void> {
  const user = await sessionFromUpgrade(req);
  if (!user || user.uiMode !== 'PRO') {
    socket.close(WS_CLOSE_FORBIDDEN, 'Forbidden');
    return;
  }

  const ctx = await resolveEditorContext(projectId, user.id);
  if (!ctx) {
    socket.close(WS_CLOSE_FORBIDDEN, 'Forbidden');
    return;
  }

  const conn: Conn = { socket, projectId, userId: user.id };
  registerEditorSocket(projectId, user.id, socket);
  let terminalReadySent = false;

  socket.on('message', (data) => {
    onSocketMessage(conn, data, () => {
      if (terminalReadySent) return;
      terminalReadySent = true;
      socket.send(JSON.stringify({ type: 'terminal.ready' }));
    });
  });

  socket.on('close', () => {
    unregisterEditorSocket(projectId, user.id, socket);
  });
}

function onSocketMessage(conn: Conn, data: RawData, onTerminalAttach: () => void): void {
  const msg = parseClientMessage(rawDataToString(data));
  if (!msg) return;
  if (msg.type === 'terminal.attach') {
    onTerminalAttach();
    return;
  }
  if (msg.type === 'editor.dirty') {
    fanOutRaw(conn.projectId, conn.userId, JSON.stringify(msg), conn.socket);
  }
}

function rawDataToString(data: RawData): string {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return Buffer.from(data).toString('utf8');
}
