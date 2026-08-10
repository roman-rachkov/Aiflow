/**
 * Non-streaming SPEC.md generation for the spec:generate tool.
 */

import type { ChatConfig, ChatMessage, ModelProvider } from '@aiflow/ai-roles';
import { getProjectClient } from '@aiflow/db';

import { listMessages } from './messages';
import { readSpecTemplate } from './prompt';
import { retrieveContext } from './retrieve';

export type SpecView = {
  id: string;
  version: number;
  content: string;
  createdAt: Date;
};

/** Generate and persist the next SPEC.md version. */
export async function generateSpecification(
  schemaName: string,
  createProvider: () => ModelProvider,
  config: ChatConfig,
): Promise<SpecView> {
  const messages = await listMessages(schemaName);
  const lastUser = [...messages].reverse().find((m) => m.role === 'USER');
  const ragContext = lastUser ? await retrieveContext(schemaName, lastUser.content) : '';
  const template = readSpecTemplate();
  const systemPrompt =
    'Based on the interview below, produce SPEC.md following this template ' +
    `exactly:\n\n${template}`;
  const dialog = messages.map((m) => `[${m.role}]: ${m.content}`).join('\n\n');
  const userTurn = ragContext ? `${dialog}\n\n${ragContext}` : dialog;
  const provider = createProvider();
  const chatMessages: ChatMessage[] = [{ role: 'USER', content: userTurn }];
  const stream = provider.chat(chatMessages, { ...config, systemPrompt });
  let fullText = '';
  for await (const chunk of stream) fullText += chunk;
  return createSpecificationVersion(schemaName, fullText);
}

async function createSpecificationVersion(schemaName: string, content: string): Promise<SpecView> {
  const client = getProjectClient(schemaName);
  const aggregate = await client.specification.aggregate({ _max: { version: true } });
  const nextVersion = (aggregate._max.version ?? 0) + 1;
  const row = await client.specification.create({
    data: { version: nextVersion, content, createdBy: 'AI' },
  });
  return {
    id: row.id,
    version: row.version,
    content: row.content,
    createdAt: row.createdAt,
  };
}
