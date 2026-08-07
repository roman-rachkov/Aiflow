'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  projectId: string;
  taskId: string;
  active: boolean;
  seed?: string;
};

/** Live sandbox log panel; WS when active, otherwise shows seed text. */
export function TaskLogPanel({ projectId, taskId, active, seed = '' }: Props) {
  const [text, setText] = useState(seed);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setText(seed);
  }, [seed, taskId]);

  useEffect(() => {
    if (!active) return;
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(
      `${proto}://${window.location.host}/api/projects/${projectId}/tasks/${taskId}/logs/ws`,
    );
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as { type?: string; chunk?: string };
        if (msg.type === 'log' && typeof msg.chunk === 'string') {
          const chunk = msg.chunk;
          setText((prev) => prev + chunk);
        }
      } catch {
        /* ignore */
      }
    };
    return () => {
      ws.close();
    };
  }, [active, projectId, taskId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [text]);

  if (!text && !active) return null;

  return (
    <div className="mt-2 rounded-md border border-border bg-surface p-3">
      <p className="mb-1 text-xs font-medium text-fg-muted">
        {active ? 'Журнал (live)' : 'Журнал'}
      </p>
      <pre className="max-h-48 overflow-auto text-xs whitespace-pre-wrap text-fg">{text}</pre>
      <div ref={endRef} />
    </div>
  );
}
