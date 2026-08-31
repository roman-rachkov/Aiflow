/**
 * Deterministic role capability policy (MVP-3 A4 / E4).
 * Tool-calling capability ≠ permission — enforced before LLM calls and at
 * mutating call sites. Never infer intent from model output.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export type AiRole = 'analyst' | 'planner' | 'coder' | 'reviewer' | 'deployer';

export type Capability =
  'read-spec' | 'read-diff' | 'read-rag' | 'plan-tasks' | 'write-commit' | 'verdict' | 'deploy';

/** Capability set per role — Reviewer has no write-commit by design. */
export const ROLE_CAPABILITIES: Readonly<Record<AiRole, readonly Capability[]>> = {
  analyst: ['read-spec', 'read-rag'],
  planner: ['read-spec', 'plan-tasks'],
  coder: ['read-spec', 'read-diff', 'write-commit'],
  reviewer: ['read-spec', 'read-diff', 'verdict'],
  deployer: ['deploy'],
};

export class PolicyViolationError extends Error {
  readonly role: AiRole;
  readonly capability: Capability;

  constructor(role: AiRole, capability: Capability) {
    super(`Policy violation: role "${role}" lacks capability "${capability}"`);
    this.name = 'PolicyViolationError';
    this.role = role;
    this.capability = capability;
  }
}

type RoleStore = { role: AiRole };

const roleStorage = new AsyncLocalStorage<RoleStore>();

/** Capabilities that authorize an LLM provider call for the active role. */
const LLM_CAPS: readonly Capability[] = [
  'read-rag',
  'plan-tasks',
  'read-diff',
  'verdict',
  'write-commit',
  'deploy',
];

/** True when the role may exercise the capability. */
export function hasCapability(role: AiRole, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

/** Active AI role for this async chain, or null when unbound. */
export function getActiveRole(): AiRole | null {
  return roleStorage.getStore()?.role ?? null;
}

/** Run `fn` with `role` bound for policy checks. */
export function runWithRole<T>(role: AiRole, fn: () => T): T {
  return roleStorage.run({ role }, fn);
}

/** Async variant of {@link runWithRole}. */
export function runWithRoleAsync<T>(role: AiRole, fn: () => Promise<T>): Promise<T> {
  return roleStorage.run({ role }, fn);
}

/**
 * Throw when the active role lacks `capability`.
 * No-op when no role is bound (legacy callers / unit tests without context).
 */
export function assertCapability(capability: Capability): void {
  const role = getActiveRole();
  if (!role) return;
  if (!hasCapability(role, capability)) {
    throw new PolicyViolationError(role, capability);
  }
}

/** Guard at the provider chokepoint — role must have at least one LLM-facing cap. */
export function assertRoleMayCallLlm(): void {
  const role = getActiveRole();
  if (!role) return;
  const caps = ROLE_CAPABILITIES[role];
  if (!caps.some((c) => LLM_CAPS.includes(c))) {
    throw new PolicyViolationError(role, 'verdict');
  }
}
