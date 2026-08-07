/**
 * Attach authenticated task-log WebSocket: Pro + project access, Redis subscribe
 * on `sandbox:logs:{taskId}` and forward chunks to the client.
 */
import type { IncomingMessage } from 'node:http';

import type { WebSocket } from 'ws';
import { getPublicClient } from '@aiflow/db';
import { createRedisConnection, sandboxLogsChannel } from '@aiflow/queue';

import { sessionFromUpgrade } from './ws-auth';

export const WS_CLOSE_FORBIDDEN = 4403;

/** Handshake + Redis fan-in for one task log WS connection. */
export async function attachTaskLogsWebSocket(
  socket: WebSocket,
  req: IncomingMessage,
  projectId: string,
  taskId: string,
): Promise<void> {
  const user = await sessionFromUpgrade(req);
  if (!user || user.uiMode !== 'PRO') {
    socket.close(WS_CLOSE_FORBIDDEN, 'Forbidden');
    return;
  }

  const meta = await getPublicClient().projectMeta.findUnique({
    where: { id: projectId, deletedAt: null },
    select: { ownerId: true },
  });
  if (!meta || meta.ownerId !== user.id) {
    socket.close(WS_CLOSE_FORBIDDEN, 'Forbidden');
    return;
  }

  const redis = createRedisConnection();
  const channel = sandboxLogsChannel(taskId);
  await redis.subscribe(channel);

  const onMessage = (ch: string, message: string) => {
    if (ch !== channel) return;
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify({ type: 'log', chunk: message }));
    }
  };
  redis.on('message', onMessage);

  socket.send(JSON.stringify({ type: 'ready', taskId }));

  const cleanup = () => {
    redis.off('message', onMessage);
    void redis.unsubscribe(channel).finally(() => {
      void redis.quit();
    });
  };
  socket.on('close', cleanup);
  socket.on('error', cleanup);
}
