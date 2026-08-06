#!/usr/bin/env bash
# Shared entrypoint for Node compose services (app, worker, model-router,
# registry-proxy). Installs deps when yarn.lock changes, generates Prisma
# clients, migrates the public schema only for ROLE=app, then execs the
# service command.
#
# registry-proxy is sandbox-only (no egress). It depends_on app healthy so
# install always runs on a networked service first; this script skips
# install/generate when the shared stamp + node_modules are already ready,
# and refuses to attempt yarn install without network if they are not.
# Corepack's Yarn download lives in the shared corepack_home volume so
# sandbox-only services can still exec `yarn`.
set -euo pipefail

cd /workspace

# Sandbox-only services cannot reach the public registry.
NO_EGRESS="${NO_EGRESS:-0}"
if [[ "${ROLE:-}" == "registry-proxy" ]]; then
  NO_EGRESS=1
fi

corepack enable
if [[ "$NO_EGRESS" != "1" ]]; then
  # Populate shared corepack_home so NO_EGRESS peers can run yarn offline.
  YARN_PM="$(node -p "require('./package.json').packageManager" 2>/dev/null || true)"
  if [[ -n "$YARN_PM" ]]; then
    corepack prepare "$YARN_PM" --activate 2>/dev/null || true
  fi
fi

STAMP_DIR="${YARN_INSTALL_STAMP_DIR:-/var/cache/aiflow-yarn}"
mkdir -p "$STAMP_DIR"
LOCK_FILE="$STAMP_DIR/install.lock"
STAMP_FILE="$STAMP_DIR/install.stamp"
YARN_LOCK="/workspace/yarn.lock"

modules_ready() {
  # Shared root volume must hold the install; @prisma/client is required next.
  [[ -d /workspace/node_modules/@prisma/client ]] \
    && [[ -d /workspace/node_modules/typescript ]]
}

clients_ready() {
  [[ -f /workspace/packages/db/generated/public/index.js ]] \
    && [[ -f /workspace/packages/db/generated/project/index.js ]]
}

needs_install() {
  if [[ ! -f "$STAMP_FILE" ]] || [[ "$YARN_LOCK" -nt "$STAMP_FILE" ]]; then
    return 0
  fi
  if ! modules_ready; then
    return 0
  fi
  return 1
}

# One install across concurrent service starts; stamp tracks yarn.lock mtime.
(
  flock 9
  if needs_install; then
    if [[ "$NO_EGRESS" == "1" ]]; then
      echo "[dev-entrypoint] FATAL: yarn install required but ROLE=${ROLE:-?} has no egress (sandbox-only)." >&2
      echo "[dev-entrypoint] Start/restart networked services first (app), or recreate volumes after app is healthy." >&2
      exit 1
    fi
    echo "[dev-entrypoint] yarn install (lockfile changed, first run, or node_modules incomplete)"
    yarn install
    touch "$STAMP_FILE"
  else
    echo "[dev-entrypoint] yarn install skipped (stamp up to date and node_modules ready)"
  fi
) 9>"$LOCK_FILE"

if clients_ready && [[ -f "$STAMP_FILE" ]] && ! [[ "$YARN_LOCK" -nt "$STAMP_FILE" ]]; then
  echo "[dev-entrypoint] prisma generate skipped (clients present)"
else
  echo "[dev-entrypoint] prisma generate"
  yarn workspace @aiflow/db generate
fi

if [[ "${ROLE:-}" == "app" ]]; then
  # migrate deploy is non-interactive — migrate dev can hang waiting for a name/TTY.
  echo "[dev-entrypoint] prisma migrate deploy (ROLE=app)"
  yarn workspace @aiflow/db migrate:deploy
fi

echo "[dev-entrypoint] exec: $*"
exec "$@"
