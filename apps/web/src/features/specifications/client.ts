/**
 * Client-only public surface of the specifications slice.
 *
 * Separated from `./index` so server generation (`generateSpecification`,
 * Prisma) is not pulled into the client graph alongside `SpecificationPanel`.
 * See `features/chat/client.ts` for the Next.js barrel-contamination rationale.
 */
export { SpecificationPanel } from './ui/SpecificationPanel';
export type { SpecificationPanelProps } from './ui/SpecificationPanel';
