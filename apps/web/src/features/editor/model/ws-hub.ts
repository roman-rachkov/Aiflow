/**
 * In-memory editor WebSocket hub (no Redis). Fan-out is same user + project
 * only — multi-user collaboration is out of scope for Task 2.2.
 *
 * Sockets are registered by the custom server (`apps/web/server.ts`) after
 * cookie auth. REST commit/create/delete/rename call `publishEditorEvent`.
 */
import type { EditorServerEvent } from './ws-protocol';

/** Minimal send surface so the hub does not import the `ws` package types. */
export type EditorHubSocket = {
  send: (data: string) => void;
  readyState: number;
};

const OPEN = 1;

type RoomKey = string;

const rooms = new Map<RoomKey, Set<EditorHubSocket>>();

function roomKey(projectId: string, userId: string): RoomKey {
  return `${projectId}:${userId}`;
}

/** Bind a live socket to `{ projectId, userId }` for fan-out. */
export function registerEditorSocket(
  projectId: string,
  userId: string,
  socket: EditorHubSocket,
): void {
  const key = roomKey(projectId, userId);
  let set = rooms.get(key);
  if (!set) {
    set = new Set();
    rooms.set(key, set);
  }
  set.add(socket);
}

/** Remove a socket; drops the room entry when empty. */
export function unregisterEditorSocket(
  projectId: string,
  userId: string,
  socket: EditorHubSocket,
): void {
  const key = roomKey(projectId, userId);
  const set = rooms.get(key);
  if (!set) return;
  set.delete(socket);
  if (set.size === 0) rooms.delete(key);
}

/**
 * Publish a server event to every open tab of this user on this project.
 * No-op when no socket is present (REST remains source of truth).
 */
export function publishEditorEvent(
  projectId: string,
  userId: string,
  event: EditorServerEvent,
): void {
  const set = rooms.get(roomKey(projectId, userId));
  if (!set || set.size === 0) return;
  const payload = JSON.stringify(event);
  for (const socket of set) {
    if (socket.readyState === OPEN) socket.send(payload);
  }
}

/** Fan-out a typed server event to other tabs, skipping the sender. */
export function fanOutEditorEvent(
  projectId: string,
  userId: string,
  event: EditorServerEvent,
  except: EditorHubSocket,
): void {
  fanOutRaw(projectId, userId, JSON.stringify(event), except);
}

/** Fan-out a pre-serialized payload (e.g. peer `editor.dirty`) to other tabs. */
export function fanOutRaw(
  projectId: string,
  userId: string,
  payload: string,
  except: EditorHubSocket,
): void {
  const set = rooms.get(roomKey(projectId, userId));
  if (!set) return;
  for (const socket of set) {
    if (socket === except) continue;
    if (socket.readyState === OPEN) socket.send(payload);
  }
}
