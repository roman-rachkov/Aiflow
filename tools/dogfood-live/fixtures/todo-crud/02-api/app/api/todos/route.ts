import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { OWNER_ID } from '@/lib/owner';

export async function GET(): Promise<NextResponse> {
  const todos = await prisma.todo.findMany({
    where: { ownerId: OWNER_ID },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ todos });
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as { title?: string };
  const title = body.title?.trim();
  if (!title) {
    return NextResponse.json({ error: 'Title required' }, { status: 400 });
  }
  const todo = await prisma.todo.create({
    data: { title, ownerId: OWNER_ID },
  });
  return NextResponse.json({ todo }, { status: 201 });
}
