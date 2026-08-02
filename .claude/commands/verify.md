---
description: Run the full CI gate locally (yarn verify) and report the first failing stage
allowed-tools: Bash(yarn verify), Bash(yarn typecheck), Bash(yarn lint), Bash(yarn format:check), Bash(yarn test)
---

Run `yarn verify` and report the result.

This is the gate defined in `package.json`: `typecheck` → `lint` → `format:check` → `test`. It runs sequentially and stops at the first failure, so a failing early stage hides later ones.

!`yarn verify`

Given the output above:

**If everything passed**, say so in one line. Nothing else needed.

**If a stage failed**, report:

1. Which stage failed — `typecheck`, `lint`, `format:check`, or `test`.
2. The specific errors, as `file:line` references so they are clickable. Do not paste the whole log.
3. Whether the failures look related to recent work in this session or pre-existing. Say which, and say if you can't tell.

For `format:check` failures specifically: these are mechanical, and `yarn format` fixes them. Say that rather than listing every file.

For `lint` failures: note that `--max-warnings 0` is in effect, so warnings block. The size limits (file ≤ 200 lines, function ≤ 50, complexity ≤ 10) surface as warnings and are therefore blocking by design — see `docs/15-engineering-conventions.md`. An exemption needs an inline reason after `--`, not a config change.

Do not fix anything unless asked. Report, and stop.
