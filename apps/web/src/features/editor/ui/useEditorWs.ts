'use client';

/**
 * Editor WebSocket client with exponential backoff reconnect.
 * Endpoint: `WS /api/projects/[id]/editor/ws` (same-origin cookie auth).
 */
import { useEffect, useRef, type MutableRefObject } from 'react';

import type { EditorServerEvent } from '../model/ws-protocol';

type PeerDirty = { type: 'editor.dirty'; path: string };
type Handlers = {
  onEvent: (event: EditorServerEvent | PeerDirty) => void;
  onStatus: (status: 'connected' | 'disconnected' | 'error', detail?: string) => void;
};

const MAX_DELAY_MS = 30_000;

export function useEditorWs(
  projectId: string,
  handlers: Handlers,
): {
  send: (msg: object) => void;
} {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    let closed = false;
    let delay = 1000;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      timer = setTimeout(() => {
        delay = Math.min(delay * 2, MAX_DELAY_MS);
        open();
      }, delay);
    };

    const open = () => {
      if (closed) return;
      const ws = createEditorSocket(
        projectId,
        handlersRef,
        () => {
          if (!closed) schedule();
        },
        () => {
          delay = 1000;
        },
      );
      wsRef.current = ws;
    };

    open();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [projectId]);

  return {
    send: (msg: object) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(msg));
      }
    },
  };
}

function createEditorSocket(
  projectId: string,
  handlersRef: MutableRefObject<Handlers>,
  onCloseReconnect: () => void,
  onOpenReset: () => void,
): WebSocket {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(
    `${proto}://${window.location.host}/api/projects/${projectId}/editor/ws`,
  );
  ws.onopen = () => {
    onOpenReset();
    handlersRef.current.onStatus('connected');
    ws.send(JSON.stringify({ type: 'editor.subscribe' }));
    ws.send(JSON.stringify({ type: 'terminal.attach' }));
  };
  ws.onmessage = (ev) => {
    try {
      handlersRef.current.onEvent(JSON.parse(String(ev.data)) as EditorServerEvent | PeerDirty);
    } catch {
      /* ignore */
    }
  };
  ws.onerror = () => {
    handlersRef.current.onStatus('error', 'Сбой WebSocket');
  };
  ws.onclose = (ev) => {
    const detail = ev.code === 4403 ? 'Нет доступа к редактору' : 'Соединение потеряно';
    handlersRef.current.onStatus('disconnected', detail);
    onCloseReconnect();
  };
  return ws;
}
