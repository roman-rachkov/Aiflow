/**
 * Planner LLM invocation: drain chat → parse JSON task array → retry on failure.
 * Decision C3: validate JSON + max 2 retries (3 attempts total).
 */

import type { ChatConfig, ChatMessage, ModelProvider } from './types';
import { PLANNER_MAX_TASKS, PLANNER_SYSTEM_PROMPT } from './planner-prompt';
import { assertCapability, runWithRoleAsync } from './policy';
import { callPlannerAdvisor, type PlannerAdvisorDeps } from './escalation';

/** Priority strings allowed in planner JSON (lowercase). */
export type PlanTaskPriority = 'critical' | 'high' | 'medium' | 'low';

/** Relative effort for sizing (advisory; not a DB column). */
export type PlanTaskEffort = 'S' | 'M' | 'L';

/** One planner-emitted task before DB mapping. */
export type PlanTask = {
  title: string;
  description: string;
  status: 'PENDING';
  priority: PlanTaskPriority;
  effort: PlanTaskEffort;
  dependencies: string[];
  acceptance: string;
  needsConfirmation: boolean;
};

const PRIORITIES = new Set<string>(['critical', 'high', 'medium', 'low']);
const EFFORTS = new Set<string>(['S', 'M', 'L']);
const MAX_PARSE_RETRIES = 2;

/** Drain an AsyncIterable of text chunks into one string. */
export async function collectChatText(stream: AsyncIterable<string>): Promise<string> {
  let full = '';
  for await (const chunk of stream) {
    full += chunk;
  }
  return full;
}

/**
 * Extract a JSON array from model text (raw or fenced ```json ... ```).
 * Throws if no array can be found or JSON.parse fails.
 */
export function extractJsonArray(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  const start = candidate.indexOf('[');
  const end = candidate.lastIndexOf(']');
  if (start < 0 || end <= start) {
    throw new Error('Planner response has no JSON array');
  }
  return JSON.parse(candidate.slice(start, end + 1)) as unknown;
}

/** Validate and normalize one planner task object. */
export function parsePlanTask(item: unknown, index: number): PlanTask {
  const idx = String(index);
  if (!item || typeof item !== 'object') {
    throw new Error(`Planner task[${idx}] is not an object`);
  }
  const row = item as Record<string, unknown>;
  const title = requireString(row.title, `task[${idx}].title`);
  const description = requireString(row.description, `task[${idx}].description`);
  const acceptance = requireString(row.acceptance, `task[${idx}].acceptance`);
  const priority = normalizePriority(row.priority, idx);
  const effort = normalizeEffort(row.effort, idx);
  const dependencies = parseDeps(row.dependencies, index);
  return {
    title,
    description,
    acceptance,
    status: 'PENDING',
    priority,
    effort,
    dependencies,
    needsConfirmation: Boolean(row.needsConfirmation),
  };
}

/** Parse unknown into PlanTask[]; throws on structural errors. */
export function parsePlanTasks(raw: string): PlanTask[] {
  const data = extractJsonArray(raw);
  if (!Array.isArray(data)) {
    throw new Error('Planner JSON root is not an array');
  }
  if (data.length === 0) {
    throw new Error('Planner JSON array is empty');
  }
  if (data.length > PLANNER_MAX_TASKS) {
    throw new Error(
      `Planner JSON array has ${String(data.length)} tasks; max is ${String(PLANNER_MAX_TASKS)}`,
    );
  }
  return data.map((item, i) => parsePlanTask(item, i));
}

export type GeneratePlanOptions = {
  /** Extra parse retries after the first attempt (default 2 → 3 tries). */
  maxRetries?: number;
  model?: string;
  apiKey?: string;
  advisorDeps?: PlannerAdvisorDeps;
};

/**
 * Call the provider with the planner system prompt and return validated tasks.
 * Retries the full LLM call when parse fails, up to `maxRetries` times.
 */
export async function generatePlanTasks(
  provider: ModelProvider,
  specMarkdown: string,
  options: GeneratePlanOptions = {},
): Promise<PlanTask[]> {
  return runWithRoleAsync('planner', async () => {
    assertCapability('plan-tasks');
    assertCapability('read-spec');
    return generatePlanTasksInner(provider, specMarkdown, options);
  });
}

async function generatePlanTasksInner(
  provider: ModelProvider,
  specMarkdown: string,
  options: GeneratePlanOptions,
): Promise<PlanTask[]> {
  const maxRetries = options.maxRetries ?? MAX_PARSE_RETRIES;
  const config: ChatConfig = {
    model: options.model ?? 'planner',
    apiKey: options.apiKey,
    systemPrompt: PLANNER_SYSTEM_PROMPT,
  };
  const messages: ChatMessage[] = [{ role: 'USER', content: specMarkdown }];
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const text = await collectChatText(provider.chat(messages, config));
      return parsePlanTasks(text);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  try {
    const text = await callPlannerAdvisor(specMarkdown, options.advisorDeps);
    return parsePlanTasks(text);
  } catch {
    // Escalation unavailable — fall through to original error.
  }

  throw lastError ?? new Error('Planner parse failed');
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Planner ${label} must be a non-empty string`);
  }
  return value.trim();
}

function normalizePriority(value: unknown, idx: string): PlanTaskPriority {
  const raw = typeof value === 'string' ? value : 'medium';
  const priority = raw.toLowerCase();
  if (!PRIORITIES.has(priority)) {
    throw new Error(`Planner task[${idx}].priority invalid: ${priority}`);
  }
  return priority as PlanTaskPriority;
}

function normalizeEffort(value: unknown, idx: string): PlanTaskEffort {
  if (value == null || value === '') return 'M';
  if (typeof value !== 'string') {
    throw new Error(`Planner task[${idx}].effort must be S|M|L`);
  }
  const effort = value.trim().toUpperCase();
  if (!EFFORTS.has(effort)) {
    throw new Error(`Planner task[${idx}].effort invalid: ${value}`);
  }
  return effort as PlanTaskEffort;
}

function parseDeps(value: unknown, index: number): string[] {
  const idx = String(index);
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new Error(`Planner task[${idx}].dependencies must be an array`);
  }
  return value.map((d, j) => {
    if (typeof d !== 'string' || d.trim().length === 0) {
      throw new Error(`Planner task[${idx}].dependencies[${String(j)}] invalid`);
    }
    return d.trim();
  });
}
