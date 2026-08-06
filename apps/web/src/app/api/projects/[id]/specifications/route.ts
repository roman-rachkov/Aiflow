import { NextResponse } from 'next/server';

import { createProviderFromEnv, readProviderConfigFromEnv } from '@aiflow/ai-roles';
import type { ChatConfig } from '@aiflow/ai-roles';

import { requireUser } from '@/features/auth';
import { listMessages, readSpecTemplate } from '@/features/chat';
import { retrieveContext } from '@/features/files/rag';
import { resolveProjectSchema } from '@/features/projects';
import { generateSpecification, listSpecifications } from '@/features/specifications';

/**
 * List and generate endpoints for a project's SPEC.md versions.
 *
 * Both handlers share the chat route's auth/resolve preamble — `requireUser`
 * then `resolveProjectSchema`, answering 404 for a missing or foreign project
 * (no existence leak). List returns the version-desc array. Generate ignores
 * the request body and runs the non-streaming generation orchestrator in the
 * specifications slice, wiring the cross-slice functions this route (in `app/`)
 * is allowed to import (the orchestrator itself cannot, due to the
 * `boundaries/dependencies` slice-capture policy). On a provider failure the
 * orchestrator throws; this handler maps any throw to 500.
 */

/** Model + key from OPENAI_* env (via {@link readProviderConfigFromEnv}). */
function buildConfig(): Pick<ChatConfig, 'model' | 'apiKey'> {
  const { chatModel, apiKey } = readProviderConfigFromEnv();
  return { model: chatModel, apiKey };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const schemaName = await resolveProjectSchema(id, user.id);
  if (!schemaName) {
    return NextResponse.json({ error: 'Проект не найден' }, { status: 404 });
  }

  const specs = await listSpecifications(schemaName);
  return NextResponse.json(specs);
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const schemaName = await resolveProjectSchema(id, user.id);
  if (!schemaName) {
    return NextResponse.json({ error: 'Проект не найден' }, { status: 404 });
  }

  try {
    const view = await generateSpecification(schemaName, {
      listMessages,
      retrieveContext,
      readSpecTemplate,
      createProvider: createProviderFromEnv,
      config: { ...buildConfig(), systemPrompt: '' },
    });
    return NextResponse.json({
      id: view.id,
      version: view.version,
      content: view.content,
      createdAt: view.createdAt,
    });
  } catch {
    return NextResponse.json({ error: 'Не удалось сгенерировать спецификацию' }, { status: 500 });
  }
}
