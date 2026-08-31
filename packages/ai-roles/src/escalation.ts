/**
 * Escalation helper: call model-router /v1/escalate when primary planner
 * exhausts retries and PLANNER_ADVISOR_MODEL is set.
 */

import { PLANNER_SYSTEM_PROMPT } from './planner-prompt';

const DEFAULT_ROUTER_URL = 'http://model-router:3001';

export type PlannerAdvisorDeps = {
  routerUrl?: string;
  advisorModel?: string;
};

function resolveAdvisorConfig(deps?: PlannerAdvisorDeps): {
  advisorModel: string;
  routerUrl: string;
} {
  const advisorModel = deps?.advisorModel ?? process.env.PLANNER_ADVISOR_MODEL ?? '';
  if (!advisorModel) throw new Error('PLANNER_ADVISOR_MODEL not configured');
  const routerUrl = (deps?.routerUrl ?? process.env.AI_ROUTER_URL ?? DEFAULT_ROUTER_URL).replace(
    /\/$/,
    '',
  );
  return { advisorModel, routerUrl };
}

function extractAdvisorContent(data: unknown): string {
  const row = data as { choices?: Array<{ message?: { content?: string } }> };
  const content = row.choices?.[0]?.message?.content;
  if (!content) throw new Error('Escalation: no content in advisor response');
  return content;
}

/** POST to model-router /v1/escalate; returns raw advisor text for parsePlanTasks. */
export async function callPlannerAdvisor(
  specMarkdown: string,
  deps?: PlannerAdvisorDeps,
): Promise<string> {
  const { advisorModel, routerUrl } = resolveAdvisorConfig(deps);
  const messages = [
    { role: 'system', content: PLANNER_SYSTEM_PROMPT },
    { role: 'user', content: specMarkdown },
  ];

  let resp: globalThis.Response;
  try {
    resp = await fetch(`${routerUrl}/v1/escalate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'planner', messages, advisorModel }),
    });
  } catch (err) {
    throw new Error(`Escalation request failed: ${String(err)}`);
  }

  if (!resp.ok) {
    throw new Error(`Escalation returned HTTP ${String(resp.status)}`);
  }

  return extractAdvisorContent(await resp.json());
}
