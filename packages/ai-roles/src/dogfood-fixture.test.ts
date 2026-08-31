import { describe, expect, it } from 'vitest';

import {
  isDogfoodFixtureEnabled,
  loadFixturePlan,
  resolveFixtureTaskSlug,
} from './dogfood-fixture';

describe('dogfood-fixture', () => {
  it('enables when DOGFOOD_FIXTURE=1', () => {
    expect(isDogfoodFixtureEnabled({ DOGFOOD_FIXTURE: '1' })).toBe(true);
    expect(isDogfoodFixtureEnabled({})).toBe(false);
  });

  it('loads todo-crud fixture plan', () => {
    const tasks = loadFixturePlan();
    expect(tasks.length).toBe(4);
    expect(tasks[0]?.title).toBe('Add Todo Prisma model');
  });

  it('maps task titles to fixture slugs', () => {
    expect(resolveFixtureTaskSlug('Todo REST API')).toBe('02-api');
    expect(resolveFixtureTaskSlug('unknown')).toBeNull();
  });
});
