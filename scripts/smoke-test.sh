#!/usr/bin/env bash
###############################################################################
# GridClan API endpoint smoke test.
#
# Exercises EVERY HTTP endpoint against a running backend and reports, per
# endpoint, whether it is reachable and behaving (no 5xx / no connection error).
#
#   Usage:  BASE=http://localhost:8080 ./scripts/smoke-test.sh
#           BASE=https://api.gridclanpuzzle.win ./scripts/smoke-test.sh   # prod (read-mostly)
#
# Verdicts:
#   OK       2xx                — happy path works
#   AUTH     401 / 403          — endpoint reached & correctly secured
#   REACHED  other 4xx (400/404/409/422/429) — wired, handled gracefully (no crash)
#   FAIL     5xx                — SERVER ERROR / crash  ← the ones that matter
#   DOWN     no response (000)  — not reachable
#
# Exit code is non-zero if any FAIL/DOWN occurred. Full report → logs/endpoint-report.log
###############################################################################
set -uo pipefail

BASE="${BASE:-http://localhost:8080}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT="$ROOT/logs/endpoint-report.log"
mkdir -p "$ROOT/logs"
: > "$REPORT"

PASS=0; FAILN=0; BODY=$(mktemp)
RUN_DESTRUCTIVE="${RUN_DESTRUCTIVE:-1}"   # set 0 to skip delete-account etc (e.g. against prod)

log() { echo -e "$1" | tee -a "$REPORT"; }

# hit METHOD PATH TOKEN DATA LABEL  → echoes response body to $BODY, sets LAST_CODE
hit() {
  local method="$1" path="$2" token="$3" data="$4" label="$5"
  local args=(-s -o "$BODY" -w "%{http_code}" -X "$method" "$BASE$path" --max-time 25)
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  if [ -n "$data" ]; then args+=(-H "Content-Type: application/json" -d "$data"); fi
  local code; code=$(curl "${args[@]}" 2>/dev/null); LAST_CODE="$code"
  local verdict color
  case "$code" in
    2*)            verdict="OK     "; color="\033[32m";;
    401|403)       verdict="AUTH   "; color="\033[36m";;
    400|404|405|409|410|422|429) verdict="REACHED"; color="\033[33m";;
    5*)            verdict="FAIL   "; color="\033[31m";;
    *)             verdict="DOWN   "; color="\033[31m";;
  esac
  if [[ "$verdict" == FAIL* || "$verdict" == DOWN* ]]; then FAILN=$((FAILN+1)); else PASS=$((PASS+1)); fi
  log "$(printf "${color}%s\033[0m %s %-6s %-34s %s" "$verdict" "$code" "$method" "$path" "$label")"
}

jqv() { jq -r "$1 // empty" "$BODY" 2>/dev/null; }

TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
log "GridClan endpoint smoke test — $TS"
log "Target: $BASE"
log "================================================================================"

# ── 0. Public / ops ──────────────────────────────────────────────────────────
log "\n── Public / ops ──"
hit GET  /ops/health        "" "" "health check"
hit POST /ops/error-report  "" '{"message":"smoke-test","stack":"n/a","platform":"smoke","appVersion":"test"}' "client error sink"

# ── 1. Auth + bootstrap two users ────────────────────────────────────────────
log "\n── Auth ──"
STAMP=$(date +%s)
EMAIL_A="smoke_${STAMP}_a@example.com";  USER_A="smokeA${STAMP}"
EMAIL_B="smoke_${STAMP}_b@example.com";  USER_B="smokeB${STAMP}"
PASS_A='Sm0ke!Test123'
DOB='2000-01-01'

hit POST /auth/register "" "{\"username\":\"$USER_A\",\"email\":\"$EMAIL_A\",\"password\":\"$PASS_A\",\"dateOfBirth\":\"$DOB\",\"countryCode\":\"UG\"}" "register user A"
TA=$(jqv .accessToken); RA=$(jqv .refreshToken); UA=$(jqv .userId)
hit POST /auth/register "" "{\"username\":\"$USER_B\",\"email\":\"$EMAIL_B\",\"password\":\"$PASS_A\",\"dateOfBirth\":\"$DOB\",\"countryCode\":\"UG\"}" "register user B"
TB=$(jqv .accessToken); UB=$(jqv .userId)

hit POST /auth/login   "" "{\"identifier\":\"$EMAIL_A\",\"password\":\"$PASS_A\"}" "login"
hit POST /auth/refresh "" "{\"refreshToken\":\"$RA\"}" "refresh token"
hit POST /auth/forgot-password "" "{\"email\":\"$EMAIL_A\"}" "forgot password"
hit POST /auth/reset-password  "" '{"token":"invalid-token","newPassword":"Wh4tever!99"}' "reset password (bad token)"

if [ -z "$TA" ]; then
  log "\n\033[31mFATAL: could not obtain access token — auth broken, aborting authed checks.\033[0m"
  log "Response body was:"; cat "$BODY" | tee -a "$REPORT"
  exit 1
fi

# ── 2. User / profile ────────────────────────────────────────────────────────
log "\n── User profile ──"
hit GET  /user/profile        "$TA" "" "get profile"
hit PUT  /user/profile        "$TA" '{"displayName":"Smoke Tester"}' "update profile"
hit PUT  /user/device-token   "$TA" '{"deviceToken":"smoke-token-xyz","platform":"android"}' "register device token"
hit GET  /user/sessions       "$TA" "" "active sessions"
hit POST /user/heartbeat      "$TA" "" "presence heartbeat"

# ── 3. Gems & points ─────────────────────────────────────────────────────────
log "\n── Gems & points ──"
hit GET  /user/gems/balance   "$TA" "" "gem balance"
hit GET  /user/gems/history   "$TA" "" "gem history"
hit POST /user/gems/gift      "$TA" "{\"toUsername\":\"$USER_B\",\"amount\":1}" "gift gems"
hit POST /user/gems/ad-reward "$TA" '{}' "ad reward gems"
hit GET  /user/points/balance "$TA" "" "points balance"
hit GET  /user/points/history "$TA" "" "points history"

# ── 4. Leaderboard ───────────────────────────────────────────────────────────
log "\n── Leaderboard ──"
hit GET  /leaderboard/global  "$TA" "" "global leaderboard"

# ── 5. Tournaments ───────────────────────────────────────────────────────────
log "\n── Tournaments ──"
NIL="00000000-0000-0000-0000-000000000000"
hit GET  /tournament                 "$TA" "" "list tournaments"
hit POST /tournament                 "$TA" '{"name":"Smoke Cup","gameType":"GOMOKU"}' "create tournament (admin-gated)"
hit GET  "/tournament/$NIL"          "$TA" "" "get tournament (missing)"
hit POST "/tournament/$NIL/join"     "$TA" '{}' "join tournament (missing)"
hit GET  "/tournament/$NIL/me"       "$TA" "" "my tournament entry"
hit GET  "/tournament/$NIL/bracket"  "$TA" "" "tournament bracket"
hit GET  "/tournament/$NIL/leaderboard" "$TA" "" "tournament leaderboard"
hit GET  "/tournament/$NIL/rank"     "$TA" "" "tournament rank"

# ── 6. Communities ───────────────────────────────────────────────────────────
log "\n── Communities ──"
hit GET  /community           "$TA" "" "list communities"
hit POST /community           "$TA" "{\"name\":\"Smoke Clan $STAMP\",\"description\":\"smoke\"}" "create community"
CID=$(jqv .id); [ -z "$CID" ] && CID=$(jqv .communityId); [ -z "$CID" ] && CID="$NIL"
hit POST "/community/$CID/join"     "$TA" '{}' "join community"
hit GET  "/community/$CID/members"  "$TA" "" "community members"
hit GET  "/community/$CID/messages" "$TA" "" "community messages"
hit POST /community/chat            "$TA" "{\"communityId\":\"$CID\",\"message\":\"smoke hello\"}" "community chat (REST)"
hit DELETE "/community/$CID/leave"  "$TA" "" "leave community"

# ── 7. Solo game sessions ────────────────────────────────────────────────────
log "\n── Game sessions (solo) ──"
hit POST /game/session/start  "$TA" '{"gameType":"WORD_SEARCH"}' "start session"
SID=$(jqv .id); [ -z "$SID" ] && SID=$(jqv .sessionId)
hit POST /game/session/move   "$TA" "{\"sessionId\":\"${SID:-$NIL}\",\"move\":{}}" "session move"
hit POST /game/session/hint   "$TA" "{\"sessionId\":\"${SID:-$NIL}\"}" "session hint"
hit POST /game/session/revive "$TA" "{\"sessionId\":\"${SID:-$NIL}\"}" "session revive"
hit POST /game/session/replay "$TA" "{\"sessionId\":\"${SID:-$NIL}\"}" "session replay"

# ── 8. PvP games (scrabble / battleship / gomoku) ────────────────────────────
for GAME in scrabble battleship gomoku; do
  log "\n── PvP: $GAME ──"
  hit POST "/$GAME"             "$TA" '{}' "create $GAME"
  GID=$(jqv .id); GCODE=$(jqv .code); [ -z "$GID" ] && GID="$NIL"; [ -z "$GCODE" ] && GCODE="ZZZZ"
  hit POST "/$GAME/$GCODE/join" "$TB" '{}' "join $GAME by code"
  hit GET  "/$GAME/$GID"        "$TA" "" "get $GAME"
  hit POST "/$GAME/$GID/move"   "$TA" '{}' "$GAME move"
  if [ "$GAME" = scrabble ]; then
    hit POST "/$GAME/$GID/pass"     "$TA" '{}' "scrabble pass"
    hit POST "/$GAME/$GID/exchange" "$TA" '{"tiles":[]}' "scrabble exchange"
  fi
done

# ── 9. Challenges ────────────────────────────────────────────────────────────
log "\n── Challenges ──"
hit POST /challenge          "$TA" '{"gameType":"GOMOKU"}' "create challenge"
CC=$(jqv .code); [ -z "$CC" ] && CC="ZZZZ"
hit GET  "/challenge/$CC"        "$TA" "" "get challenge by code"
hit POST "/challenge/$CC/accept" "$TB" '{}' "accept challenge"

# ── 10. Admin (user A is USER, not ADMIN → 403 expected = correct) ───────────
log "\n── Admin (expect 403 for a normal user = correctly secured) ──"
hit POST   "/admin/suspend/$UB" "$TA" '{"reason":"smoke"}' "suspend user"
hit DELETE "/admin/suspend/$UB" "$TA" "" "lift suspension"
hit GET    /admin/flagged          "$TA" "" "flagged accounts"
hit GET    /admin/pending-deletions "$TA" "" "pending deletions"
hit GET    /admin/users            "$TA" "" "list users"
hit GET    /admin/metrics/users    "$TA" "" "user metrics"
hit PUT    /admin/feature-flags    "$TA" '{"flags":{}}' "update feature flags"

# ── 11. Account lifecycle (destructive — last) ──────────────────────────────
if [ "$RUN_DESTRUCTIVE" = "1" ]; then
  log "\n── Account lifecycle (destructive, on throwaway user A) ──"
  hit POST   /user/delete-account  "$TA" "{\"password\":\"$PASS_A\"}" "request account deletion"
  hit DELETE /user/cancel-deletion "$TA" "" "cancel account deletion"
  hit POST   /auth/logout          "$TA" "" "logout"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
log "\n================================================================================"
log "RESULT: $PASS reached/ok, \033[31m$FAILN failed (5xx/down)\033[0m"
log "Full report: $REPORT"
rm -f "$BODY"
[ "$FAILN" -eq 0 ] && exit 0 || exit 1
