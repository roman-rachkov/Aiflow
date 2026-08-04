# Task 1.2a — Authentication + base UI shell

Plan of record. Scope agreed with the user 2026-08-04. Supersedes nothing; task 1.2
in `docs/04-roadmap.md:38-43` is split into 1.2a (this) and 1.2b (projects CRUD).

## Scope

**In:** NextAuth v5 + Prisma adapter + Credentials provider (dev-usable, no SMTP /
no OAuth App). App shell: root layout, header, side menu, sign-in page,
authenticated dashboard placeholder. Guards `requireUser`, `requireProMode`,
`canAccessProject`.

**Out:** projects CRUD and the project list / project card pages (→ 1.2b).
`project_{uuid}` schema provisioning on project create (the unfinished tail of
task 1.1) — deferred pending open question #2 on migrations.

**Deviation to record:** the roadmap specifies Email magic-link + GitHub OAuth.
We ship Credentials instead, with the provider array shaped so adding the other
two is a config edit. Needs an entry in `docs/14-decisions-needed.md`.

## Decisions taken before implementation

| #   | Finding                                                                                                                                                                                                                                                                    | Decision                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `requireEngineer` would have to key off `uiMode`, not `role`. `schema.prisma:23-28` splits the two deliberately: `role` = authorization, `uiMode` = presentation, "not a permission boundary". Confirmed by `docs/09-ui-spec.md:22` and `docs/14-decisions-needed.md:151`. | Name it **`requireProMode`**, checking `uiMode === 'PRO'`. No `UserRole` migration. Update the forward declaration at `docs/16-code-map.md:61`. |
| 2   | Adapter writes the avatar to `image`; schema has `avatarUrl` (`schema.prisma:33`).                                                                                                                                                                                         | **Rename `avatarUrl` → `image`.** Zero consumers today.                                                                                         |
| 3   | `User` lacks `emailVerified` (required by `AdapterUser`) and any password field.                                                                                                                                                                                           | Add `emailVerified DateTime?` and `passwordHash String?`.                                                                                       |
| 4   | `apps/web/package.json` has no `@aiflow/db` dependency — only `transpilePackages` (`next.config.ts:5`) and the TS path (`tsconfig.base.json:17`). `tsc` passes, `next dev` fails at runtime.                                                                               | Add the workspace dependency. First time the web app touches the DB.                                                                            |
| 5   | `packages/db/prisma/migrations/` does not exist — verified, no files.                                                                                                                                                                                                      | First `migrate dev` will want to baseline the whole schema and may offer a **destructive reset**. Inspect `_prisma_migrations` before running.  |
| 6   | Header + side menu in the auth slice pushed it to ~505 lines, over the 400-line slice budget in `docs/15-engineering-conventions.md` § 5.5.                                                                                                                                | Header/menu go to **`shared/ui/`** — they are not authentication. Auth slice lands ~305.                                                        |

`canAccessProject` is **not** a stub: `ProjectMeta.ownerId` exists and is indexed
(`schema.prisma:56-70`), so an ownership check is real. What does not exist is any
collaborator/sharing model — so: ownership real, sharing explicitly unimplemented,
documented in the doc comment rather than hidden behind a TODO.

## Step 0 — spike first (15 min, do before writing anything)

`@auth/prisma-adapter` is typed against `PrismaClient` from `@prisma/client`. We
generate to `../generated/public` (decision C2). The two are structurally
compatible but TS may reject the nominal mismatch, and `no-explicit-any` is
**error** (`eslint.config.mjs:48`) so the usual escape hatch is closed.

Verify the adapter accepts `getPublicClient()`. If it does not: a narrowly scoped
cast with an `eslint-disable` carrying a `--` reason naming C2. This is the single
most likely thing to block the build.

## Steps

1. **Spike** the adapter/client type compatibility (above).
2. **Schema** — `emailVerified`, `passwordHash`, `avatarUrl`→`image`. Then migration,
   checking `_prisma_migrations` state first. `migrate dev` covers `public` only.
3. **Deps** — `apps/web`: `next-auth@5` (pinned exact — beta tag moves),
   `@auth/prisma-adapter`, `@aiflow/db` (workspace), `bcrypt` + types.
4. **Auth config** — `features/auth/model/config.ts` holds the NextAuth options;
   `features/auth/model/nextauth.ts` calls `NextAuth()` and exports `auth`,
   `handlers`, `signIn`, `signOut`. Split so the route handler and the guards both
   import without a cycle.
5. **Guards** — `features/auth/model/guards.ts`. Imports `auth` from
   `./nextauth` **directly, never via `../index`** — the barrel re-exports guards,
   so that would trip `import/no-cycle` (error, `eslint.config.mjs:50`).
6. **Route handler** — `app/api/auth/[...nextauth]/route.ts` is a thin re-export
   of `handlers`. `app/**` may not reach feature internals (`eslint.config.mjs:76-91`).
7. **Shell** — route groups `(auth)` and `(app)`. The existing `app/page.tsx`
   **must move** into `(app)/page.tsx`; leaving both is a build error, two files
   resolving to `/`. Route groups do not appear in the URL. `error.tsx` /
   `loading.tsx` stay at root.
8. **Tests** — guards + `authorize`, in the `packages/db/src/client.test.ts` style.
   Mock `redirect` to **throw**, mirroring real `NEXT_REDIRECT` control flow — a
   mock that returns lets code continue past a guard and passes a test that must
   fail. Assert the session user **omits `passwordHash`**.
9. **Env** — add vars to `.env.example` (exists).
10. **Docs, same commit** — `docs/16-code-map.md` (new slice, `shared/ui`, guard
    rename), `docs/04-roadmap.md` (1.2a/1.2b split), `docs/14-decisions-needed.md`
    (Credentials deviation), `docs/15-engineering-conventions.md` § 5.5 if needed.

## Signatures

```ts
requireUser(): Promise<SessionUser>              // redirect → /signin
requireProMode(): Promise<SessionUser>           // redirect → / (Customer is not an error)
canAccessProject(userId, projectId): Promise<boolean>  // returns, does not redirect
```

`canAccessProject` returns a boolean deliberately: the caller chooses 404 vs 403,
and that caller is 1.2b.

## Language policy

Docs, code comments, commit messages — **English**. **Russian** only for
user-facing strings: sign-in form labels and errors, side-menu labels, sign-out,
dashboard placeholder. `app/page.tsx:5` already confirms the pattern.

Pre-existing inconsistency, out of scope: `app/error.tsx:6` is user-facing but
English. Worth a debt-register line.

## Risks

- Adapter type mismatch (step 0) — most likely blocker.
- `migrate dev` offering a reset — check `_prisma_migrations` first.
- `next-auth@5` is beta; pin exact. Isolation behind `features/auth` means a
  breaking change touches `config.ts` / `nextauth.ts`, not call sites.
- No CI. `yarn verify` is local-only; nothing but discipline prevents a red commit.

## Known deviation

`docs/16-code-map.md:43` assigns `packages/ui` to task 1.2. Not building it —
one consumer fails the § 2.3 promotion test. Recorded, not overlooked.

## Commits

```
feat(db): add emailVerified, passwordHash and rename avatarUrl to image
chore(web): add next-auth, prisma adapter and @aiflow/db dependency
feat(web): add auth feature slice with NextAuth v5 and dev credentials
feat(web): add app shell with header, side menu and sign-in page
test(web): cover auth guards and credentials authorize
docs: split roadmap task 1.2, record credentials deviation
```

Branch `task/1.2a-auth` off `main`, rebase-only. Docs commit lands in the same PR.
