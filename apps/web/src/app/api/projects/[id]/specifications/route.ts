import { NextResponse } from 'next/server';

import { requireUser } from '@/features/auth';
import { listMessages, readSpecTemplate } from '@/features/chat';
import { retrieveContext } from '@/features/files/rag';
import { resolveAnalystProvider } from '@/features/model-config';
import { resolveProjectSchema } from '@/features/projects';
import { generateSpecification, listSpecifications } from '@/features/specifications';

/**
 * List and generate endpoints for a project's SPEC.md versions.
 *
 * Generate resolves Analyst ModelConfig via `resolveAnalystProvider` (project
 * key when present, else env). Embeddings/RAG stay on env inside retrieve.
 */

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
    const resolved = await resolveAnalystProvider(schemaName);
    const view = await generateSpecification(schemaName, {
      listMessages,
      retrieveContext,
      readSpecTemplate,
      createProvider: () => resolved.provider,
      config: {
        model: resolved.chatConfig.model,
        apiKey: resolved.chatConfig.apiKey,
        systemPrompt: '',
      },
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
