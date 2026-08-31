/**
 * Public-schema Prisma singleton. Kept off `index.ts` so audit helpers (and
 * other writers) can import without a circular dependency through the barrel.
 */

import { PrismaClient as PublicClient } from '../generated/public';

let publicClient: PublicClient | undefined;

/** The `public` schema client. One per process. */
export function getPublicClient(): PublicClient {
  publicClient ??= new PublicClient();
  return publicClient;
}

/** Disconnect the public client (process shutdown / test teardown). */
export async function disconnectPublicClient(): Promise<void> {
  await publicClient?.$disconnect();
  publicClient = undefined;
}
