import { describe, expect, it } from 'vitest';

import { appSchemaNameFromProjectSchema, assertValidAppSchemaName } from './app-schema';

describe('appSchemaNameFromProjectSchema', () => {
  it('swaps the project_ prefix', () => {
    expect(appSchemaNameFromProjectSchema('project_abc123')).toBe('app_abc123');
  });

  it('rejects non-project names', () => {
    expect(() => appSchemaNameFromProjectSchema('public')).toThrow(/Not a project/);
  });
});

describe('assertValidAppSchemaName', () => {
  it('accepts app_{id}', () => {
    expect(() => {
      assertValidAppSchemaName('app_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    }).not.toThrow();
  });

  it('rejects project schemas', () => {
    expect(() => {
      assertValidAppSchemaName('project_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    }).toThrow(/app_/);
  });
});
