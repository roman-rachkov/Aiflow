---
name: warn-destructive-prisma
enabled: true
event: bash
action: warn
conditions:
  - field: command
    operator: regex_match
    pattern: prisma\s+(migrate\s+(reset|dev)|db\s+push)
---

⚠️ **Destructive Prisma command — check the database state first**

`migrate reset`, `migrate dev` and `db push` can all drop and recreate data.
`migrate dev` is the deceptive one: when it finds no `_prisma_migrations` table
it offers to **baseline the whole schema with a reset**, and that prompt is easy
to accept while thinking it is routine.

This is a warning, not a block — `migrate dev` is the correct tool for authoring
a new migration, and task 1.2b will need it for the `project_{uuid}` schema.

**Before running it, confirm what the database actually contains:**

```sh
# Does the schema differ from the live database, and how?
npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma --script

# What has already been applied?
npx prisma migrate status --schema prisma/schema.prisma
```

**If the goal is to apply an existing migration, use the non-destructive path:**

```sh
npx prisma migrate deploy --schema prisma/schema.prisma
```

In task 1.2a the baseline migration was generated **offline** with
`migrate diff --from-empty` and applied with `migrate deploy`, precisely so that
`migrate dev` never got the chance to offer a reset. That is the pattern to
repeat when a migration is being introduced to a database that already exists.

Remember also that `prisma migrate` covers the **`public` schema only**.
Per-project `project_{uuid}` schemas are created from a generated SQL script —
see `docs/03-data-model.md` § 8 and `packages/db/scripts/generate-project-sql.ts`.
