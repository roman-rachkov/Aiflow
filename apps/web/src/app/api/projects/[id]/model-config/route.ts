import { NextResponse } from 'next/server';

import { requireUser } from '@/features/auth';
import {
  assertProModelConfig,
  getAnalystModelConfig,
  isEncryptionKeyError,
  ModelConfigValidationError,
  upsertAnalystModelConfig,
} from '@/features/model-config';
import type { UpsertAnalystInput } from '@/features/model-config';
import { resolveProjectSchema } from '@/features/projects';

import { parsePutBody } from './parse-body';

/**
 * GET/PUT ModelConfig for the Analyst role.
 * Wiring only: Pro + owner gates; logic lives in `features/model-config`.
 */

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const forbidden = assertProModelConfig(user);
  if (forbidden) return forbidden;

  const schemaName = await resolveProjectSchema(id, user.id);
  if (!schemaName) {
    return NextResponse.json({ error: 'Проект не найден' }, { status: 404 });
  }

  try {
    const body = await getAnalystModelConfig(schemaName);
    return NextResponse.json(body);
  } catch (error) {
    if (isEncryptionKeyError(error)) {
      return NextResponse.json({ error: 'Ошибка шифрования на сервере' }, { status: 500 });
    }
    return NextResponse.json({ error: 'Не удалось загрузить настройки модели' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const forbidden = assertProModelConfig(user);
  if (forbidden) return forbidden;

  const schemaName = await resolveProjectSchema(id, user.id);
  if (!schemaName) {
    return NextResponse.json({ error: 'Проект не найден' }, { status: 404 });
  }

  let input: UpsertAnalystInput;
  try {
    input = parsePutBody(await request.json());
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Некорректное тело запроса';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const body = await upsertAnalystModelConfig(schemaName, id, input);
    return NextResponse.json(body);
  } catch (error) {
    if (error instanceof ModelConfigValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (isEncryptionKeyError(error)) {
      return NextResponse.json({ error: 'Ошибка шифрования на сервере' }, { status: 500 });
    }
    return NextResponse.json({ error: 'Не удалось сохранить настройки модели' }, { status: 500 });
  }
}
