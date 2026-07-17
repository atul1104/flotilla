#!/usr/bin/env bash
#
# pair-code.sh — mint a Flotilla computer pairing code and print the ready-to-run
# daemon command. Independent of the web UI and of npm: only needs curl + jq.
#
# Usage:
#   ./scripts/pair-code.sh <server-url> <email> <workspace-slug> [password]
#
#   <server-url>      e.g. https://flotilla-production.up.railway.app
#   <email>           your Flotilla login email
#   <workspace-slug>  the workspace slug (the path segment in the UI URL, e.g.
#                     https://flotilla-production.up.railway.app/<slug>)
#   [password]        if omitted, prompted for securely (no echo)
#
# Output: a one-line `flotilla-daemon pair <server> <code>` command. The code
# expires in 10 minutes (PAIRING_TTL_MIN in the API).
#
# Requires: curl, jq. (macOS has curl; `brew install jq` if jq is missing.)

set -euo pipefail

die() { echo "error: $*" >&2; exit 1; }

# --- args ---
[ $# -ge 3 ] || die "usage: $0 <server-url> <email> <workspace-slug> [password]"
SERVER="${1%/}"
EMAIL="$2"
SLUG="$3"
PASSWORD="${4:-}"

[ -n "$PASSWORD" ] || {
  printf 'password for %s: ' "$EMAIL" >&2
  read -rs PASSWORD
  echo >&2
}
[ -n "$PASSWORD" ] || die "password is required"

command -v curl >/dev/null || die "curl is required"
command -v jq   >/dev/null || die "jq is required (brew install jq)"

COOKIE_JAR="$(mktemp -t flotilla-pair.XXXXXX)"
trap 'rm -f "$COOKIE_JAR"' EXIT

# --- login (session cookie saved to the jar) ---
LOGIN_BODY=$(jq -nc --arg e "$EMAIL" --arg p "$PASSWORD" '{email:$e,password:$p}')
LOGIN_HTTP=$(curl -s -o /dev/null -w '%{http_code}' \
  -X POST "$SERVER/api/v1/auth/login" \
  -H 'content-type: application/json' \
  -d "$LOGIN_BODY" \
  -c "$COOKIE_JAR")
[ "$LOGIN_HTTP" = "200" ] || die "login failed (HTTP $LOGIN_HTTP) — check email/password and server URL"

# --- resolve the workspace id from the slug ---
WS_LIST=$(curl -s "$SERVER/api/v1/workspaces" -b "$COOKIE_JAR")
WS_ID=$(printf '%s' "$WS_LIST" | jq -r --arg slug "$SLUG" \
  '.items[] | select(.slug == $slug) | .id' | head -n1)
[ -n "$WS_ID" ] || die "workspace '$SLUG' not found for this user. Available slugs:"$'\n'"$(printf '%s' "$WS_LIST" | jq -r '.items[].slug')"

# --- mint the pairing code ---
PAIR_RES=$(curl -s -X POST "$SERVER/api/v1/workspaces/$WS_ID/computers/pairing-code" \
  -b "$COOKIE_JAR" -H 'content-type: application/json' -d '{}')
CODE=$(printf '%s' "$PAIR_RES" | jq -r '.code // empty')
SERVER_URL=$(printf '%s' "$PAIR_RES" | jq -r '.serverUrl // empty')
[ -n "$CODE" ] || die "pairing-code request failed: $PAIR_RES"

# Prefer the server's own API_ORIGIN; fall back to the URL we were given.
PAIR_SERVER="${SERVER_URL:-$SERVER}"

echo
echo "Pairing code (expires in 10 min). Run this on the machine to pair:"
echo
echo "  flotilla-daemon pair $PAIR_SERVER $CODE"
echo
