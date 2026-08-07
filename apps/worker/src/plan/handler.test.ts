import { describe, expect, it, vi } from 'vitest';

import type { Job } from 'bullmq';
import type { PlanGeneratePayload } from '@aiflow/queue';
import type { PlanTask } from '@aiflow/ai-roles';

import { handlePlanGenerate, validatePlanPayload, type PlanHandlerDeps } from './handler';

const PAYLOAD: PlanGeneratePayload = {
  projectId: 'proj-1',
  schemaName: 'project_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  specificationId: 'spec-1',
  specificationVersion: 2,
};

const PLAN: PlanTask[] = [
  {
    title: 'Add Item model',
    description: 'Create Item in Prisma schema.',
    status: 'PENDING',
    priority: 'high',
    dependencies: [],
    acceptance: 'Item model validates.',
    needsConfirmation: false,
    effort: 'M',
  },
  {
    title: 'List items API',
    description: 'GET /api/items',
    status: 'PENDING',
    priority: 'medium',
    dependencies: ['Add Item model'],
    acceptance: 'Route returns 200.',
    needsConfirmation: false,
    effort: 'S',
  },
];

function job(data: PlanGeneratePayload): Job<PlanGeneratePayload> {
  return { data, id: 'job-1' } as Job<PlanGeneratePayload>;
}

function mockDeps(overrides: Partial<PlanHandlerDeps> = {}): PlanHandlerDeps {
  return {
    loadSpecification: vi.fn(() =>
      Promise.resolve({
        id: 'spec-1',
        content: '# Spec',
        approvedAt: new Date('2026-08-01'),
      }),
    ),
    generatePlan: vi.fn(() => Promise.resolve(PLAN)),
    persistPlan: vi.fn(() => Promise.resolve({ taskIds: ['t1', 't2'], replacedCount: 0 })),
    ...overrides,
  };
}

describe('validatePlanPayload', () => {
  it('rejects missing specificationId', () => {
    expect(() => {
      validatePlanPayload({ ...PAYLOAD, specificationId: '' });
    }).toThrow(/specificationId/);
  });

  it('rejects bad version', () => {
    expect(() => {
      validatePlanPayload({ ...PAYLOAD, specificationVersion: 0 });
    }).toThrow(/specificationVersion/);
  });
});

describe('handlePlanGenerate', () => {
  it('loads spec, generates plan, persists', async () => {
    const deps = mockDeps();
    const result = await handlePlanGenerate(job(PAYLOAD), deps);
    expect(deps.loadSpecification).toHaveBeenCalledWith(PAYLOAD.schemaName, 'spec-1');
    expect(deps.generatePlan).toHaveBeenCalledWith('# Spec');
    expect(deps.persistPlan).toHaveBeenCalledWith(
      expect.objectContaining({ specificationId: 'spec-1', plan: PLAN }),
    );
    expect(result.taskIds).toEqual(['t1', 't2']);
  });

  it('fails when specification missing', async () => {
    const deps = mockDeps({ loadSpecification: vi.fn(() => Promise.resolve(null)) });
    await expect(handlePlanGenerate(job(PAYLOAD), deps)).rejects.toThrow(/not found/);
    expect(deps.generatePlan).not.toHaveBeenCalled();
  });

  it('fails when specification not approved', async () => {
    const deps = mockDeps({
      loadSpecification: vi.fn(() =>
        Promise.resolve({
          id: 'spec-1',
          content: '# Spec',
          approvedAt: null,
        }),
      ),
    });
    await expect(handlePlanGenerate(job(PAYLOAD), deps)).rejects.toThrow(/not approved/);
  });
});
