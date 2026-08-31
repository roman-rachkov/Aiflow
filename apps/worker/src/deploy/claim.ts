/**
 * Idempotent claim for deploy:run (MVP-3 A1).
 * BUILDING continues; DEPLOYED is a no-op success; FAILED rejects.
 */

export type DeployRow = {
  id: string;
  status: 'BUILDING' | 'DEPLOYED' | 'FAILED';
  imageTag: string | null;
  url: string | null;
};

export type DeployClaim =
  | { kind: 'run'; deployment: DeployRow }
  | { kind: 'skip-deployed'; deployment: DeployRow }
  | { kind: 'reject'; reason: string };

/** Decide whether to build, skip an already-deployed row, or reject. */
export function resolveDeployClaim(deployment: DeployRow | null): DeployClaim {
  if (!deployment) return { kind: 'reject', reason: 'Deployment not found' };
  if (deployment.status === 'DEPLOYED') {
    return { kind: 'skip-deployed', deployment };
  }
  if (deployment.status === 'FAILED') {
    return { kind: 'reject', reason: 'Deployment already FAILED' };
  }
  return { kind: 'run', deployment };
}
