---
name: warn-bash-instead-of-glob
enabled: true
event: bash
action: warn
conditions:
  - field: command
    operator: regex_match
    pattern: (^|&&|;)\s*find\s(?!.*-\w*(mtime|size|newer)\b)[^|;&>\n]*(;|&&|$)
---

⚠️ **Bare `find` — prefer the Glob tool**

You are listing files from the shell. Use the **Glob** tool instead: it returns
the same paths, already sorted, with no cwd dependency (the shell working
directory resets between calls here, so `find .` can silently search the wrong
tree).

Measured **92×** in the last 7 days.

**This rule does NOT fire on what Glob cannot express:**

```sh
find . -name "*.log" -mtime -1   # metadata predicate — fine
find /tmp -size +1M              # size predicate — fine
find . -type f | xargs wc -l     # pipeline — fine
```

It **does** still fire on `find -exec …` — that is deliberate. `-exec` runs a
command, not a listing, and is unusual enough (and often destructive) to warrant
a look.

**Do this instead:**

```sh
# Not:  find . -name "*.ts" -type f
# Not:  find apps -name "schema.prisma"
```

List with the Glob tool (`**/*.ts` in `apps`). Keep `find` in Bash for the
metadata predicates (`-mtime`, `-size`, `-newer`) that Glob cannot express.
