/**
 * Public surface of the specifications feature slice. Everything outside this
 * slice (pages, API routes, other slices) imports from here. Cross-slice
 * feature→feature imports are blocked by `boundaries/dependencies` in
 * eslint.config.mjs (the policy uses `capture: slice` to require a matching
 * slice name for feature→feature, so this barrel is the only seam).
 */
export type { SpecificationListItemView, SpecificationView } from './model/types';
export {
  approveSpecification,
  createSpecificationVersion,
  getSpecificationByVersion,
  listSpecifications,
} from './model/service';
export type { GenerationDeps } from './model/generate';
export { generateSpecification } from './model/generate';
// SpecificationPanel lives in `./client` — do not re-export it here (Next.js
// barrel contamination with server generation / Prisma).
