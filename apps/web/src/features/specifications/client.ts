/**
 * Client-only public surface of the specifications slice.
 *
 * Separated from `./index` so server generation (`generateSpecification`,
 * Prisma) is not pulled into the client graph alongside the panels.
 * See `features/chat/client.ts` for the Next.js barrel-contamination rationale.
 */
export { SpecificationPanel } from './ui/SpecificationPanel';
export type { SpecificationPanelProps } from './ui/SpecificationPanel';
export { SpecPreviewPanel } from './ui/SpecPreviewPanel';
export type { SpecPreviewPanelProps } from './ui/SpecPreviewPanel';
