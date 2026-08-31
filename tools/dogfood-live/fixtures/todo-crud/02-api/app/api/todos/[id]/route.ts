import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { OWNER_ID } from '@/lib/owner';

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const body = (await request.json()) as { done?: boolean; title?: string };
  const existing = await prisma.todo.findFirst({ where: { id, ownerId: OWNER_ID } });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const todo = await prisma.todo.update({
    where: { id },
    data: {
      ...(typeof body.done === 'boolean' ? { done: body.done } : {}),
      ...(body.title?.trim() ? { title: body.title.trim() } : {}),
    },
  });
  return NextResponse.json({ todo });
}

export async function DELETE(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const existing = await prisma.todo.findFirst({ where: { id, ownerId: OWNER_ID } });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await prisma.todo.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
