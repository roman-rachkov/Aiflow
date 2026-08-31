/**
 * BullMQ handler for `chat:run` — multi-turn AG-UI tool loop + Redis publish.
 */

import type { Job } from 'bullmq';
import { runWithTraceContext } from '@aiflow/ai-roles';
import { validateChatRunPayload, type ChatRunPayload } from '@aiflow/queue';

import { runChatJob } from './run';

/** Process one chat:run job. */
export async function handleChatRun(job: Job<ChatRunPayload>): Promise<void> {
  validateChatRunPayload(job.data);
  await runWithTraceContext(
    {
      role: 'analyst',
      projectId: job.data.projectId,
      sessionId: job.data.threadId,
      tags: ['chat-run'],
    },
    () => runChatJob(job.data),
  );
}
