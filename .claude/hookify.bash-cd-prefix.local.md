---
name: block-bash-cd-prefix
enabled: true
event: bash
action: block
conditions:
  - field: command
    operator: regex_match
    pattern: (^|&&|;|\|)\s*cd\s
---

🚫 **Relative `cd` in a Bash command — blocked**

The shell working directory **resets between calls** in this environment, so a
`cd` prefix does not do what it looks like it does. The next call starts
somewhere else entirely.

**This is the single most frequent defect in this repo**, measured over 7 days:
332 of 984 Bash calls (34%) used a `cd` prefix, and it is the direct cause of 18
`File does not exist` errors. The count _rose_ from 290 after the rule was
written into `docs/17-session-review.md` § 3.4 — documenting it changed nothing,
which is why it is now enforced here.

**Two real failures this caused:**

- `cd packages/db && npx prisma …` ran from `apps/web`, because an earlier
  command had already moved the shell. Loud failure.
- `rm -f apps/web/src/spike-adapter.ts && echo "spike removed"` ran while the
  shell sat in `packages/db`. Deleted nothing, exited 0, printed the success
  message. **Silent** failure — it survived until an unrelated `ls` contradicted
  it.

**Do this instead:**

```sh
# Not:  cd packages/db && npx prisma generate
npx prisma generate --schema /d/work/AIFlow/packages/db/prisma/schema.prisma

# Not:  cd apps/web && yarn typecheck
yarn workspace @aiflow/web typecheck
```

Yarn workspace commands (`yarn workspace <name> <script>`) are the idiomatic
route in this monorepo and never need a `cd`. If a tool genuinely requires a
working directory, pass it as that tool's own flag — not as a shell prefix.

See `docs/17-session-review.md` §§ 3.4, 3.9.
