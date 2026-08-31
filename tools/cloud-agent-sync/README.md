# Cloud Agent Tools Sync

Pull your personal Cursor agent tools (skills, slash commands, subagents, hooks)
from a git remote into project directories that **Cloud Agents** read on boot.

Desktop Cursor loads `~/.cursor/skills/` locally, but Cloud Agent VMs do **not**
copy that folder. This tool closes the gap by syncing from a git-backed catalog
during environment `install` (see `.cursor/environment.json`).

## Quick start

1. **Create a personal tools repo** (one repo for all projects), e.g.
   `github.com/you/my-agent-tools`, with this layout:

   ```
   my-agent-tools/
   ├── skills/
   │   └── docs-autopilot/
   │       └── SKILL.md
   ├── commands/
   │   └── my-command.md
   ├── agents/
   │   └── my-agent.md
   └── hooks/
       └── hookify.my-rule.local.md
   ```

2. **Per project**, copy the example config and set your remote:

   ```sh
   cp .cursor/agent-sync.example.json .cursor/agent-sync.json
   # edit sources[].git to your repo URL
   ```

3. **Commit** `.cursor/agent-sync.json` if the whole team should share the same
   catalog, or keep it personal (add to `.git/info/exclude` locally).

4. Cloud Agents run `bash tools/cloud-agent-sync/sync.sh` from
   `.cursor/environment.json` `install` on every environment bootstrap.

5. For **private** git remotes, add the repo to `repositoryDependencies` in
   `.cursor/environment.json` so Cursor includes it in the agent token scope.

## What gets synced where

| Source (in git repo) | Default destination(s) | Cloud Agent reads |
| -------------------- | ---------------------- | ----------------- |
| `skills/<name>/`     | `.cursor/skills/`, `.claude/skills/` | `.cursor/skills/` (Cursor-native) |
| `commands/*.md`      | `.claude/commands/`    | Legacy slash commands |
| `agents/*.md`        | `.claude/agents/`      | Subagent prompts |
| `hooks/hookify.*.local.md` | `.claude/`      | Hookify rules |

Synced files land **next to** project-committed tools. Existing project files are
**never overwritten** unless `overwrite: true` in config or you pass `--force`.

## Config reference

File: `.cursor/agent-sync.json` (schema: `tools/cloud-agent-sync/agent-sync.schema.json`)

```json
{
  "cacheDir": ".cursor/.agent-sync-cache",
  "overwrite": false,
  "targets": {
    "skills": [".cursor/skills", ".claude/skills"],
    "commands": [".claude/commands"],
    "agents": [".claude/agents"],
    "hooks": [".claude"]
  },
  "sources": [
    {
      "git": "https://github.com/you/my-agent-tools.git",
      "ref": "main",
      "layout": "standard"
    }
  ]
}
```

### Source types

**Git remote** (works on Cloud Agents):

```json
{ "git": "https://github.com/you/my-agent-tools.git", "ref": "main" }
```

**Local path** (desktop dev only — skipped when path missing on VM):

```json
{ "local": "~/.cursor/skills", "as": "skills" }
```

Use local sources to test before pushing to git. Cloud Agents rely on git remotes.

### Layouts

- `standard` (default): `skills/`, `commands/`, `agents/`, `hooks/` subdirectories.
- `flat-skills`: skill directories at repo root (each contains `SKILL.md`).

## CLI

```sh
bash tools/cloud-agent-sync/sync.sh           # sync (no-op if no config)
bash tools/cloud-agent-sync/sync.sh --check   # validate config JSON only
bash tools/cloud-agent-sync/sync.sh --dry-run # print actions, no writes
bash tools/cloud-agent-sync/sync.sh --force   # overwrite existing synced files
```

Override config path: `AGENT_SYNC_CONFIG=/path/to.json bash tools/cloud-agent-sync/sync.sh`

## Desktop ↔ cloud workflow

Recommended loop for skills you build in one project and want everywhere:

1. Develop skill in `~/.cursor/skills/` on desktop (available in all local projects).
2. Copy or symlink into your `my-agent-tools` git repo under `skills/`.
3. Push to GitHub.
4. Every Cloud Agent project with `agent-sync.json` pointing at that repo gets
   the skill on next agent start.

For local-only convenience, add a **second** source with `"local": "~/.cursor/skills"`.
Desktop runs pick it up; cloud runs skip it safely.

## Design tradeoffs

| Approach | Verdict |
| -------- | ------- |
| **A. Repo-bundled copy** | Good for project-specific tools; does not solve cross-project personal catalog. |
| **B. Git remote + install script** | **Chosen.** One `my-agent-tools` repo, config per project, runs on cloud boot. |
| **C. Environment snapshot** | Bakes a point-in-time image; poor for iterating on skills frequently. |
| **D. Manifest only** | Same as B; `agent-sync.json` is the manifest. |

MCP server config (`.mcp.json` / `.cursor/mcp.json`) is **not** merged — too
project-specific and merge-conflict prone. Keep MCP in the repo; sync skills/commands/agents/hooks only.

## Limitations

- No automatic push from desktop to git — you maintain the `my-agent-tools` repo.
- Private remotes need `repositoryDependencies` in `environment.json`.
- Team Marketplaces (Teams/Enterprise) are an alternative for org-wide rollouts.
- Synced skills in `.cursor/skills/` may be gitignored if you prefer not to commit them; the sync runs on the VM filesystem regardless.

## Related

- Cursor docs: [Agent Skills](https://cursor.com/docs/skills) — Cloud Agents read `.cursor/skills/` from the repo checkout, not `~/.cursor/skills/`.
- Env setup: `.cursor/environment.json` `install` hook (see `env-setup` skill).
- Registry entry: `docs/13-agent-tooling.md`.
