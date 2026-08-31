/**
 * Unit tests for agent-memory store/retrieve (MVP-3 C2).
 * Uses vi.mock to stub getProjectClient — no real DB required.
 */

import { describe, expect, it, vi } from 'vitest';

const mockAgentMemory = {
  create: vi.fn(),
  findMany: vi.fn(),
};

const mockClient = { agentMemory: mockAgentMemory };

vi.mock('./index', () => ({
  getProjectClient: vi.fn(() => mockClient),
}));

import { retrieveLessons, storeLesson } from './agent-memory';

const SCHEMA = 'project_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TASK_ID = 'task-uuid-1';

const STORED_ROW = {
  id: 'mem-1',
  taskId: TASK_ID,
  role: 'REVIEWER' as const,
  lesson: 'Always add a null check before dereferencing.',
  createdAt: new Date('2026-08-31T00:00:00.000Z'),
};

describe('storeLesson', () => {
  it('creates an AgentMemory row and returns it', async () => {
    mockAgentMemory.create.mockResolvedValue(STORED_ROW);

    const result = await storeLesson(SCHEMA, {
      taskId: TASK_ID,
      role: 'REVIEWER',
      lesson: 'Always add a null check before dereferencing.',
    });

    expect(mockAgentMemory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { taskId: TASK_ID, role: 'REVIEWER', lesson: expect.any(String) },
      }),
    );
    expect(result.lesson).toBe('Always add a null check before dereferencing.');
  });
});

describe('retrieveLessons', () => {
  it('returns lessons for a task filtered by role', async () => {
    mockAgentMemory.findMany.mockResolvedValue([STORED_ROW]);

    const rows = await retrieveLessons(SCHEMA, { taskId: TASK_ID, role: 'REVIEWER' });

    expect(mockAgentMemory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ taskId: TASK_ID, deletedAt: null, role: 'REVIEWER' }),
        take: 5,
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].lesson).toBe(STORED_ROW.lesson);
  });

  it('omits role filter when not specified', async () => {
    mockAgentMemory.findMany.mockResolvedValue([]);

    await retrieveLessons(SCHEMA, { taskId: TASK_ID });

    const call = mockAgentMemory.findMany.mock.calls.at(-1)?.[0] as
      { where?: Record<string, unknown>; take?: number } | undefined;
    expect(call?.where).not.toHaveProperty('role');
  });

  it('respects custom limit', async () => {
    mockAgentMemory.findMany.mockResolvedValue([]);

    await retrieveLessons(SCHEMA, { taskId: TASK_ID, limit: 3 });

    const call = mockAgentMemory.findMany.mock.calls.at(-1)?.[0] as
      { where?: Record<string, unknown>; take?: number } | undefined;
    expect(call?.take).toBe(3);
  });

  it('returns empty array when no lessons exist', async () => {
    mockAgentMemory.findMany.mockResolvedValue([]);

    const rows = await retrieveLessons(SCHEMA, { taskId: TASK_ID });
    expect(rows).toEqual([]);
  });
});
