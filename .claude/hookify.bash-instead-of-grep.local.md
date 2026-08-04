---
name: warn-bash-instead-of-grep
enabled: true
event: bash
action: warn
conditions:
  - field: command
    operator: regex_match
    pattern: (^|&&|;)\s*(grep|rg|egrep|fgrep)\s[^|;&>\n]*(;|&&|$)
---

⚠️ **Bare `grep`/`rg` — prefer the Grep tool**

You are searching the repo from the shell. Use the **Grep** tool instead: it is
ripgrep-backed, returns clickable file links, and is immune to the cwd hazard
(the shell working directory resets between calls here). Searches run through
Bash also inherit shell-quoting traps — this window recorded 3 `ripgrep rejected
the pattern` errors that the Grep tool would not have produced.

Measured **335×** in the last 7 days against only 165 Grep calls.

**This rule does NOT fire on pipeline filtering:**

```sh
ps aux | grep node      # filtering a live stream — fine
history | rg prune      # filtering command history — fine
git grep foo            # git's own subcommand, not a repo search — fine
```

**Do this instead:**

```sh
# Not:  grep -rn "TODO" apps/web/src
# Not:  rg "deploy" packages
```

Search with the Grep tool (path + pattern). Keep `grep` in Bash only when
filtering another command's output.
