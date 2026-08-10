import { Queue, type DefaultJobOptions } from 'bullmq';

import { createRedisConnection } from './connection';
import { QUEUE_CHAT_RUN } from './names';

/**
 * Payload for `chat:run`. Next auth'd the user and saved the USER message;
 * the worker runs the multi-turn tool-aware LLM loop and publishes AG-UI
 * events to {@link chatRunChannel}.
 */
export type ChatRunPayload = {
  projectId: string;
  schemaName: string;
  threadId: string;
  runId: string;
  ownerId: string;
  uiMode: 'BASIC' | 'PRO';
  /** Latest user message text (already persisted). */
  userMessage: string;
};

/** Chat runs are fail-fast — retrying a partial stream duplicates side effects. */
export const CHAT_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 1,
  removeOnComplete: 50,
  removeOnFail: 50,
};

/** Redis pub/sub channel for live AG-UI SSE frames (Next bridges to the client). */
export function chatRunChannel(runId: string): string {
  return `chat:run:${runId}`;
}

const REQUIRED: (keyof ChatRunPayload)[] = [
  'projectId',
  'schemaName',
  'threadId',
  'runId',
  'ownerId',
  'uiMode',
  'userMessage',
];

/** Validate payload shape; throws on missing/empty strings or bad uiMode. */
export function validateChatRunPayload(data: ChatRunPayload): void {
  for (const key of REQUIRED) {
    const value = data[key];
    if (key === 'uiMode') {
      if (value !== 'BASIC' && value !== 'PRO') {
        throw new Error('Invalid chat payload: uiMode must be BASIC or PRO');
      }
      continue;
    }
    if (!value || typeof value !== 'string') {
      throw new Error(`Invalid chat payload: missing ${key}`);
    }
  }
}

let chatQueue: Queue<ChatRunPayload> | undefined;

/** Producer-only queue accessor. App never runs workers from this package. */
export function getChatRunQueue(): Queue<ChatRunPayload> {
  chatQueue ??= new Queue<ChatRunPayload>(QUEUE_CHAT_RUN, {
    connection: createRedisConnection(),
    defaultJobOptions: CHAT_JOB_OPTIONS,
  });
  return chatQueue;
}

/** Test / shutdown helper — clears the singleton. */
export async function closeChatRunQueue(): Promise<void> {
  if (!chatQueue) return;
  await chatQueue.close();
  chatQueue = undefined;
}
