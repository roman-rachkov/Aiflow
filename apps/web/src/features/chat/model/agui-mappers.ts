/**
 * Conversion between our persisted `ChatMessageView` and the AG-UI `Message`
 * shape the OpenUI `ChatProvider` / `restStorage` exchange over the wire.
 *
 * AG-UI messages (from `@ag-ui/core`, re-exported by `@openuidev/react-headless`)
 * are a discriminated union on `role`. We only persist text turns, so the map is
 * narrow: USER → `{role:'user', content:[{type:'text',text}]}`, ASSISTANT →
 * `{role:'assistant', content}`. SYSTEM rows are never persisted (the system
 * prompt is read from file), so they never cross this boundary.
 */

import type { ChatMessageView } from './types';

/** Minimal AG-UI message subset we emit/consume. Keeps the package boundary free of the ag-ui import. */
export interface AguiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'developer';
  content?: string;
}

/** Persisted row → AG-UI wire message. */
export function toAguiMessage(view: ChatMessageView): AguiMessage {
  return {
    id: view.id,
    role: view.role === 'SYSTEM' ? 'system' : (view.role.toLowerCase() as 'user' | 'assistant'),
    content: view.content,
  };
}

/** Map a list of persisted rows to the AG-UI wire format, oldest first. */
export function toAguiMessages(views: readonly ChatMessageView[]): AguiMessage[] {
  return views.map(toAguiMessage);
}

/** AG-UI wire message → plain text content (the only kind we persist today). */
export function aguiMessageText(message: { content?: unknown }): string {
  return typeof message.content === 'string' ? message.content : '';
}

/** Minimal AG-UI thread subset that `restStorage` returns / accepts. */
export interface AguiThread {
  id: string;
  title: string;
  createdAt: string | number;
  isPending?: boolean;
}

/**
 * `restStorage` exchanges threads with `createdAt` as a string|number and
 * carries no fork lineage on the wire. Persisted `Date` → ISO string.
 */
export function toAguiThread(view: { id: string; title: string; createdAt: Date }): AguiThread {
  return {
    id: view.id,
    title: view.title,
    createdAt: view.createdAt.toISOString(),
  };
}
