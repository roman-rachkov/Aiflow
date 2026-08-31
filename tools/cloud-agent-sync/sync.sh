#!/usr/bin/env bash
# Sync personal agent tools (skills, commands, agents, hooks) from git remotes
# or local paths into project directories that Cloud Agents read.
#
# Usage:
#   tools/cloud-agent-sync/sync.sh [--force] [--dry-run] [--check]
#
# Config: .cursor/agent-sync.json (see agent-sync.example.json)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

FORCE=0
DRY_RUN=0
CHECK_ONLY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force) FORCE=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --check) CHECK_ONLY=1; shift ;;
    -h | --help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

CONFIG="${AGENT_SYNC_CONFIG:-${REPO_ROOT}/.cursor/agent-sync.json}"

log() { printf '[agent-sync] %s\n' "$*"; }
warn() { printf '[agent-sync] WARN: %s\n' "$*" >&2; }

require_jq() {
  if ! command -v jq >/dev/null 2>&1; then
    echo '[agent-sync] ERROR: jq is required but not installed.' >&2
    exit 1
  fi
}

if [[ ! -f "$CONFIG" ]]; then
  log "No config at ${CONFIG}; skipping (copy agent-sync.example.json to enable)."
  exit 0
fi

require_jq

if ! jq empty "$CONFIG" 2>/dev/null; then
  echo "[agent-sync] ERROR: invalid JSON in ${CONFIG}" >&2
  exit 1
fi

CACHE_DIR_REL="$(jq -r '.cacheDir // ".cursor/.agent-sync-cache"' "$CONFIG")"
CACHE_DIR="${REPO_ROOT}/${CACHE_DIR_REL}"
OVERWRITE_CFG="$(jq -r '.overwrite // false' "$CONFIG")"
if [[ "$FORCE" -eq 1 ]]; then
  OVERWRITE=1
else
  OVERWRITE=$([[ "$OVERWRITE_CFG" == "true" ]] && echo 1 || echo 0)
fi

# shellcheck disable=SC2207
readarray -t SKILL_TARGETS < <(jq -r '.targets.skills[]? // empty' "$CONFIG")
# shellcheck disable=SC2207
readarray -t COMMAND_TARGETS < <(jq -r '.targets.commands[]? // empty' "$CONFIG")
# shellcheck disable=SC2207
readarray -t AGENT_TARGETS < <(jq -r '.targets.agents[]? // empty' "$CONFIG")
# shellcheck disable=SC2207
readarray -t HOOK_TARGETS < <(jq -r '.targets.hooks[]? // empty' "$CONFIG")

# Defaults when targets omitted
if [[ ${#SKILL_TARGETS[@]} -eq 0 ]]; then
  SKILL_TARGETS=(".cursor/skills" ".claude/skills")
fi
if [[ ${#COMMAND_TARGETS[@]} -eq 0 ]]; then
  COMMAND_TARGETS=(".claude/commands")
fi
if [[ ${#AGENT_TARGETS[@]} -eq 0 ]]; then
  AGENT_TARGETS=(".claude/agents")
fi
if [[ ${#HOOK_TARGETS[@]} -eq 0 ]]; then
  HOOK_TARGETS=(".claude")
fi

resolve_path() {
  local rel="$1"
  if [[ "$rel" == /* ]]; then
    printf '%s' "$rel"
  else
    printf '%s/%s' "$REPO_ROOT" "$rel"
  fi
}

expand_home() {
  local p="$1"
  if [[ "$p" == "~/"* ]]; then
    printf '%s/%s' "$HOME" "${p#~/}"
  else
    printf '%s' "$p"
  fi
}

ensure_dir() {
  local dir="$1"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "would mkdir -p ${dir}"
  else
    mkdir -p "$dir"
  fi
}

copy_entry() {
  local src="$1"
  local dest_dir="$2"
  local name
  name="$(basename "$src")"
  local dest="${dest_dir}/${name}"

  if [[ -e "$dest" && "$OVERWRITE" -eq 0 ]]; then
    log "skip (exists): ${dest}"
    return 0
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "would copy: ${src} -> ${dest}"
    return 0
  fi

  if [[ -d "$src" ]]; then
    if [[ -e "$dest" ]]; then
      rm -rf "$dest"
    fi
    cp -a "$src" "$dest"
  else
    cp -a "$src" "$dest"
  fi
  log "copied: ${name} -> ${dest_dir}/"
}

sync_skills_from() {
  local src_root="$1"
  local skills_dir="${src_root}/skills"

  if [[ -d "$skills_dir" ]]; then
    local target
    for target in "${SKILL_TARGETS[@]}"; do
      local abs_target
      abs_target="$(resolve_path "$target")"
      ensure_dir "$abs_target"
      local skill
      for skill in "$skills_dir"/*; do
        [[ -e "$skill" ]] || continue
        [[ -f "${skill}/SKILL.md" || -f "${skill}/skill.md" ]] || continue
        copy_entry "$skill" "$abs_target"
      done
    done
    return 0
  fi

  # flat-skills layout: skill dirs at repo root
  local entry
  for entry in "$src_root"/*; do
    [[ -d "$entry" ]] || continue
    [[ -f "${entry}/SKILL.md" || -f "${entry}/skill.md" ]] || continue
    local target
    for target in "${SKILL_TARGETS[@]}"; do
      copy_entry "$entry" "$(resolve_path "$target")"
    done
  done
}

sync_md_files_from() {
  local src_root="$1"
  local sub="$2"
  shift 2
  local targets=("$@")
  local src_dir="${src_root}/${sub}"

  [[ -d "$src_dir" ]] || return 0

  local target
  for target in "${targets[@]}"; do
    local abs_target
    abs_target="$(resolve_path "$target")"
    ensure_dir "$abs_target"
    local file
    for file in "$src_dir"/*.md; do
      [[ -e "$file" ]] || continue
      copy_entry "$file" "$abs_target"
    done
  done
}

sync_hooks_from() {
  local src_root="$1"
  local hooks_dir="${src_root}/hooks"
  local search_dir="$src_root"

  if [[ -d "$hooks_dir" ]]; then
    search_dir="$hooks_dir"
  fi

  local target
  for target in "${HOOK_TARGETS[@]}"; do
    local abs_target
    abs_target="$(resolve_path "$target")"
    ensure_dir "$abs_target"
    local hook
    for hook in "$search_dir"/hookify.*.local.md; do
      [[ -e "$hook" ]] || continue
      copy_entry "$hook" "$abs_target"
    done
  done
}

sync_from_tree() {
  local tree="$1"
  local layout="${2:-standard}"

  if [[ ! -d "$tree" ]]; then
    warn "source tree missing: ${tree}"
    return 0
  fi

  if [[ "$layout" == "flat-skills" ]]; then
    sync_skills_from "$tree"
  else
    sync_skills_from "$tree"
    sync_md_files_from "$tree" "commands" "${COMMAND_TARGETS[@]}"
    sync_md_files_from "$tree" "agents" "${AGENT_TARGETS[@]}"
    sync_hooks_from "$tree"
  fi
}

clone_or_update_git() {
  local url="$1"
  local ref="$2"
  local dest="$3"

  if [[ -d "${dest}/.git" ]]; then
    if [[ "$DRY_RUN" -eq 1 ]]; then
      log "would git fetch ${url} (${ref}) in ${dest}"
      return 0
    fi
    git -C "$dest" fetch --depth 1 origin "$ref" 2>/dev/null || git -C "$dest" fetch --depth 1 origin
    git -C "$dest" checkout -q FETCH_HEAD 2>/dev/null || git -C "$dest" checkout -q "$ref"
    return 0
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "would git clone --depth 1 --branch ${ref} ${url} ${dest}"
    return 0
  fi

  ensure_dir "$(dirname "$dest")"
  if ! git clone --depth 1 --branch "$ref" "$url" "$dest" 2>/dev/null; then
    # branch may not exist; clone default then checkout ref
    git clone --depth 1 "$url" "$dest"
    git -C "$dest" checkout -q "$ref"
  fi
}

cache_key_for_url() {
  printf '%s' "$1" | sha256sum | cut -c1-12
}

SOURCE_COUNT="$(jq '.sources | length' "$CONFIG")"
if [[ "$SOURCE_COUNT" -eq 0 ]]; then
  log "Config has no sources; nothing to sync."
  exit 0
fi

if [[ "$CHECK_ONLY" -eq 1 ]]; then
  log "Config OK (${SOURCE_COUNT} source(s))."
  exit 0
fi

log "Syncing from ${CONFIG} (overwrite=$([[ $OVERWRITE -eq 1 ]] && echo yes || echo no))"

idx=0
while [[ "$idx" -lt "$SOURCE_COUNT" ]]; do
  source_json="$(jq -c ".sources[$idx]" "$CONFIG")"

  if jq -e '.git' <<<"$source_json" >/dev/null 2>&1; then
    url="$(jq -r '.git' <<<"$source_json")"
    ref="$(jq -r '.ref // "main"' <<<"$source_json")"
    layout="$(jq -r '.layout // "standard"' <<<"$source_json")"
    key="$(cache_key_for_url "$url")"
    dest="${CACHE_DIR}/${key}"

    log "git source: ${url} @ ${ref}"
    clone_or_update_git "$url" "$ref" "$dest"
    sync_from_tree "$dest" "$layout"
  elif jq -e '.local' <<<"$source_json" >/dev/null 2>&1; then
    local_path="$(expand_home "$(jq -r '.local' <<<"$source_json")")"
    as_kind="$(jq -r '.as // "skills"' <<<"$source_json")"
    layout="$(jq -r '.layout // "standard"' <<<"$source_json")"

    if [[ ! -e "$local_path" ]]; then
      warn "local path not found (skipped on cloud): ${local_path}"
    elif [[ "$as_kind" == "skills" ]]; then
      log "local skills: ${local_path}"
      # ~/.cursor/skills holds skill dirs directly (no skills/ wrapper)
      local target
      for target in "${SKILL_TARGETS[@]}"; do
        local abs_target
        abs_target="$(resolve_path "$target")"
        ensure_dir "$abs_target"
        local entry
        for entry in "$local_path"/*; do
          [[ -d "$entry" ]] || continue
          [[ -f "${entry}/SKILL.md" || -f "${entry}/skill.md" ]] || continue
          copy_entry "$entry" "$abs_target"
        done
      done
    else
      log "local tree: ${local_path}"
      sync_from_tree "$local_path" "$layout"
    fi
  else
    warn "source #${idx} has no .git or .local field; skipping"
  fi

  idx=$((idx + 1))
done

log "Done."
