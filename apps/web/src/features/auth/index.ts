/**
 * Public surface of the auth slice. Everything outside `features/auth` must
 * import from here — deep paths are rejected by `import/no-internal-modules`
 * and, for `app/`, by `no-restricted-imports` (eslint.config.mjs).
 */
export type { SessionUser } from './model/config';
export { canAccessProject, requireProMode, requireUser } from './model/guards';
export { handlers, signIn, signOut } from './model/nextauth';
export { SignInForm } from './ui/SignInForm';
export { UserBadge } from './ui/UserBadge';
