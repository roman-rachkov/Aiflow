/**
 * Resolve owned project + Gitea identity for deploy routes.
 * Missing gitea* → DeployGiteaMissingError (404 + editor hint). Soft-delete +
 * ownership enforced; no existence leak for foreign projects.
 */

import { getPublicClient } from '@aiflow/db';
import { NextResponse } from 'next/server';

import { DeployGiteaMissingError, type DeployContext } from './types';

export type ProApiUser = { uiMode: 'BASIC' | 'PRO' };

/** 403 JSON when caller is not PRO (Build / export). */
export function assertProDeploy(user: ProApiUser): NextResponse | null {
  if (user.uiMode === 'PRO') return null;
  return NextResponse.json(
    { error: 'Сборка и экспорт доступны только в режиме Pro' },
    { status: 403 },
  );
}

/**
 * Load deploy context for an owned, non-deleted project.
 * Returns `null` when missing/foreign; throws when Gitea is not provisioned.
 */
export async function resolveDeployContext(
  projectId: string,
  ownerId: string,
): Promise<DeployContext | null> {
  const meta = await getPublicClient().projectMeta.findUnique({
    where: { id: projectId, deletedAt: null },
    select: {
      id: true,
      ownerId: true,
      schemaName: true,
      giteaOwner: true,
      giteaRepo: true,
      giteaDefaultBranch: true,
    },
  });
  if (!meta || meta.ownerId !== ownerId) return null;

  if (!meta.giteaOwner || !meta.giteaRepo) {
    throw new DeployGiteaMissingError();
  }

  return {
    projectId: meta.id,
    schemaName: meta.schemaName,
    giteaOwner: meta.giteaOwner,
    giteaRepo: meta.giteaRepo,
    giteaDefaultBranch: meta.giteaDefaultBranch || 'main',
  };
}
