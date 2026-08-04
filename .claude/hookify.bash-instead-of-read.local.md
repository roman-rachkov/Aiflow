---
name: warn-bash-instead-of-read
enabled: true
event: bash
action: warn
conditions:
  - field: command
    operator: regex_match
    pattern: (^|&&|;)\s*(cat(?!\s*<<)|head(?!\s*-f\b)|tail(?!\s*-f\b))\s[^|;&>\n]*(;|&&|$)
---

⚠️ **Bare `cat`/`head`/`tail` — prefer the Read tool**

You are reading a file's contents with a bare shell read. Use the **Read** tool
instead: it returns line numbers, syntax-aware output, and does not depend on
the shell's working directory — which **resets between calls in this
environment**, so a bare `cat file` from the wrong cwd is a silent `No such file
or directory`.

Measured **732×** in the last 7 days against only 887 Read calls — the single
largest tool-displacement in the window, and a direct cause of the
`path-not-found` bucket.

**This rule does NOT fire on legitimate shell reads:**

```sh
cat file.json | jq .name   # pipeline: output feeds another program — fine
cat src > out.txt          # redirect: a copy, not a read — fine
tail -f app.log            # live follow, Read cannot do this — fine
cat << EOF                 # heredoc into a file/stdin — fine
```

It still fires on a bare read in a compound command (`cat x | grep y && cat z`
— the trailing `cat z` is a read and should be a Read call).

**Do this instead:**

```sh
# Not:  cat package.json
# Not:  head -n 20 apps/web/package.json
```

Read the file with the Read tool (or `mcp__idea__read_file` for IDE-integrated
reads). See `docs/17-session-review.md` § 3.3.
