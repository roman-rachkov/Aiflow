#!/usr/bin/env bash
# Idempotent Gitea bootstrap for AI Studio compose.
# Creates the repo-owner admin user and writes an API token to
# /run/gitea/token (shared volume). Safe to re-run after `docker compose down -v`.
set -euo pipefail

GITEA_URL="${GITEA_URL:-http://gitea:3000}"
OWNER="${GITEA_REPO_OWNER:-aistudio}"
# Never commit a default password. Empty → generate a local-only value
# (API access uses the minted token file, not this password).
PASSWORD="${GITEA_ADMIN_PASSWORD:-}"
if [[ -z "$PASSWORD" ]]; then
  PASSWORD="Dev$(head -c 12 /dev/urandom | base64 | tr -d '\n/+=' | head -c 16)9"
fi
EMAIL="${GITEA_ADMIN_EMAIL:-aistudio@example.com}"
TOKEN_OUT="${GITEA_ADMIN_TOKEN_FILE:-/run/gitea/token}"
EXISTING_TOKEN="${GITEA_ADMIN_TOKEN:-}"

mkdir -p "$(dirname "$TOKEN_OUT")"

echo "[gitea-init] waiting for ${GITEA_URL}/api/healthz"
for _ in $(seq 1 60); do
  if curl -fsS "${GITEA_URL}/api/healthz" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
curl -fsS "${GITEA_URL}/api/healthz" >/dev/null

echo "[gitea-init] ensure admin user '${OWNER}'"
# `gitea` CLI needs the container work path; ignore "already exists".
if ! gitea admin user create \
  --admin \
  --username "$OWNER" \
  --password "$PASSWORD" \
  --email "$EMAIL" \
  --must-change-password=false 2>/tmp/gitea-user-create.err; then
  if ! grep -qiE 'already exists|user already exists|duplicate' /tmp/gitea-user-create.err; then
    cat /tmp/gitea-user-create.err >&2
    exit 1
  fi
  echo "[gitea-init] user already exists — ok"
fi

token_ok() {
  local tok="$1"
  [[ -n "$tok" ]] || return 1
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' \
    -H "Authorization: token ${tok}" \
    "${GITEA_URL}/api/v1/user")"
  [[ "$code" == "200" ]]
}

TOKEN=""
if token_ok "$EXISTING_TOKEN"; then
  TOKEN="$EXISTING_TOKEN"
  echo "[gitea-init] env GITEA_ADMIN_TOKEN is valid"
elif [[ -f "$TOKEN_OUT" ]] && token_ok "$(tr -d '[:space:]' <"$TOKEN_OUT")"; then
  TOKEN="$(tr -d '[:space:]' <"$TOKEN_OUT")"
  echo "[gitea-init] existing token file is valid"
else
  echo "[gitea-init] minting access token"
  # Output: "Access token was successfully created: <token>"
  out="$(gitea admin user generate-access-token \
    --username "$OWNER" \
    --token-name "aiflow-$(date +%s)" \
    --scopes all)"
  TOKEN="$(printf '%s\n' "$out" | sed -n 's/.*: *\([A-Za-z0-9_]*\)$/\1/p' | tail -n1)"
  if [[ -z "$TOKEN" ]]; then
    echo "[gitea-init] failed to parse token from: $out" >&2
    exit 1
  fi
  if ! token_ok "$TOKEN"; then
    echo "[gitea-init] minted token failed /api/v1/user check" >&2
    exit 1
  fi
fi

printf '%s\n' "$TOKEN" >"$TOKEN_OUT"
chmod 644 "$TOKEN_OUT"
echo "[gitea-init] wrote token to ${TOKEN_OUT}"
