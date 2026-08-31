'use client';

/**
 * Minimal Support Bot chat panel for the Pro "Agents" sidebar route.
 *
 * Lightweight single-turn chat: no thread persistence, answers from RAG on
 * every send. Designed as a Pro-only testing interface.
 */

import { useState, useRef, type FormEvent } from 'react';
import { Button, Spinner } from '@aiflow/ui';

export interface SupportBotPanelProps {
  projectId: string;
}

interface Message {
  role: 'user' | 'assistant';
  text: string;
  sources?: string[];
}

/** Parse SSE lines from a buffered string; returns parsed deltas and leftover buffer. */
function parseSseLine(line: string): { text?: string; done?: boolean; sources?: string[] } | null {
  if (!line.startsWith('data:')) return null;
  const raw = line.slice(5).trim();
  if (!raw || raw === '[DONE]') return null;
  try {
    return JSON.parse(raw) as { text?: string; done?: boolean; sources?: string[] };
  } catch {
    return null;
  }
}

/** Drain the SSE response body; calls `onChunk` for each text delta. */
async function drainSse(
  body: ReadableStream<Uint8Array>,
  onChunk: (text: string) => void,
): Promise<string[]> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let sources: string[] = [];

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const parsed = parseSseLine(line);
      if (!parsed) continue;
      if (parsed.done) sources = parsed.sources ?? [];
      else if (parsed.text) onChunk(parsed.text);
    }
  }
  return sources;
}

export function SupportBotPanel({ projectId }: SupportBotPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text }]);
    const botIdx = messages.length + 1;
    setMessages((prev) => [...prev, { role: 'assistant', text: '' }]);
    setLoading(true);

    try {
      await sendMessage(projectId, text, botIdx, setMessages);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PanelHeader />
      <MessageList messages={messages} loading={loading} />
      <ChatForm
        input={input}
        loading={loading}
        onFocusRef={() => {
          /* focus managed inside ChatForm */
        }}
        onInputChange={setInput}
        onSubmit={(e) => void handleSubmit(e)}
      />
    </div>
  );
}

async function sendMessage(
  projectId: string,
  text: string,
  botIdx: number,
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
) {
  try {
    const res = await fetch(`/api/projects/${projectId}/support/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    });
    if (!res.ok || !res.body) throw new Error('Request failed');

    const sources = await drainSse(res.body, (chunk) => {
      setMessages((prev) =>
        prev.map((m, i) => (i === botIdx ? { ...m, text: m.text + chunk } : m)),
      );
    });

    if (sources.length > 0) {
      setMessages((prev) => prev.map((m, i) => (i === botIdx ? { ...m, sources } : m)));
    }
  } catch {
    setMessages((prev) =>
      prev.map((m, i) =>
        i === botIdx ? { ...m, text: 'Произошла ошибка. Попробуйте ещё раз.' } : m,
      ),
    );
  }
}

function PanelHeader() {
  return (
    <div className="flex-none border-b border-border px-4 py-3">
      <h2 className="text-base font-semibold text-fg">Support Bot</h2>
      <p className="text-xs text-fg-muted">Отвечает на вопросы по документации проекта</p>
    </div>
  );
}

function MessageList({ messages, loading }: { messages: Message[]; loading: boolean }) {
  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
      {messages.length === 0 ? (
        <p className="text-sm text-fg-muted">Задайте вопрос о вашем приложении.</p>
      ) : (
        messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} isLast={i === messages.length - 1} loading={loading} />
        ))
      )}
    </div>
  );
}

function MessageBubble({
  msg,
  isLast,
  loading,
}: {
  msg: Message;
  isLast: boolean;
  loading: boolean;
}) {
  const isUser = msg.role === 'user';
  return (
    <div className={isUser ? 'text-right' : 'text-left'}>
      <div
        className={
          isUser
            ? 'bg-accent ml-8 inline-block rounded-lg px-3 py-2 text-sm text-white'
            : 'mr-8 inline-block rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg'
        }
      >
        {msg.text || (loading && isLast ? <Spinner /> : null)}
      </div>
      {msg.sources && msg.sources.length > 0 && (
        <div className="mt-1 text-xs text-fg-muted">Источники: {msg.sources.join(', ')}</div>
      )}
    </div>
  );
}

interface ChatFormProps {
  input: string;
  loading: boolean;
  onFocusRef: () => void;
  onInputChange: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
}

function ChatForm({ input, loading, onInputChange, onSubmit }: ChatFormProps) {
  const localRef = useRef<HTMLInputElement>(null);
  return (
    <form onSubmit={onSubmit} className="flex flex-none gap-2 border-t border-border px-4 py-3">
      <input
        ref={localRef}
        type="text"
        value={input}
        onChange={(e) => {
          onInputChange(e.target.value);
        }}
        placeholder="Введите вопрос…"
        disabled={loading}
        className="focus:ring-accent flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:ring-1 focus:outline-hidden disabled:opacity-50"
      />
      <Button type="submit" disabled={loading || !input.trim()} size="sm">
        {loading ? <Spinner /> : 'Отправить'}
      </Button>
    </form>
  );
}
