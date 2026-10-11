#!/usr/bin/env bash
# secret-scan.sh — scan GIT-TRACKED files for leaked credentials.
# Usage: scripts/secret-scan.sh [--out <json-path>]   (run from anywhere inside the repo)
# Output: JSON {findings:[], info:[], scanned_files} on stdout (and to --out); exit 1 when findings is non-empty.
# The OnDemand key VALUE is read from $ON_DEMAND_API_KEY at runtime and is NEVER echoed.
set -u

OUT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --out) OUT="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "not a git repo" >&2; exit 2; }
cd "$ROOT"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
FILES="$TMP/files"; FINDINGS="$TMP/findings"; INFO="$TMP/info"
: >"$FINDINGS"; : >"$INFO"
git ls-files -z | tr '\0' '\n' >"$FILES"
SCANNED=$(wc -l <"$FILES" | tr -d ' ')

# text files only (skip binaries: png/jpg/sqlite/xlsx/zip/pdf/webm/woff…)
grep -v -E -i '\.(png|jpe?g|gif|webp|ico|svg|sqlite|db|xlsx|zip|gz|pdf|webm|mp4|woff2?|ttf|otf|eot)$' "$FILES" >"$TMP/text" || true

# add <kind> <rule> <file> <line> <excerpt>  — excerpt is redacted (never a full secret)
json_escape() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/\t/\\t/g' -e 's/\r//g'; }
add() {
  local kind="$1" rule="$2" file="$3" line="$4" excerpt="$5"
  excerpt="$(printf '%s' "$excerpt" | cut -c1-80)"
  printf '  {"rule":"%s","file":"%s","line":%s,"excerpt":"%s"}\n' \
    "$(json_escape "$rule")" "$(json_escape "$file")" "${line:-0}" "$(json_escape "$excerpt")" >>"$TMP/$kind"
}

# redact a matched line: keep the first 12 chars of a token-looking run, mask the rest
redact() { cut -c1-14 | sed 's/$/…REDACTED/'; }

# helper: grep a regex across a file list, route to kind
scan_regex() {
  local kind="$1" rule="$2" regex="$3" list="$4"
  [ -s "$list" ] || return 0
  # shellcheck disable=SC2046
  xargs -d '\n' -a "$list" grep -n -I -E -H -o -e "$regex" -- 2>/dev/null | head -500 | while IFS= read -r hit; do
    local file="${hit%%:*}" rest="${hit#*:}"
    local line="${rest%%:*}" match="${rest#*:}"
    add "$kind" "$rule" "$file" "$line" "$(printf '%s' "$match" | redact)"
  done
}

# 1) tracked .env* files (except *.example)
grep -E '(^|/)\.env[^/]*$' "$FILES" | grep -v -E '\.example$' | while IFS= read -r f; do
  add findings "tracked-dotenv" "$f" 0 "tracked env file"
done

# 2) the OnDemand API key VALUE (from env, never echoed)
if [ -n "${ON_DEMAND_API_KEY:-}" ] && [ "${#ON_DEMAND_API_KEY}" -ge 12 ]; then
  xargs -d '\n' -a "$TMP/text" grep -n -I -F -H -- "$ON_DEMAND_API_KEY" 2>/dev/null | cut -d: -f1,2 | while IFS=: read -r f l; do
    add findings "ondemand-api-key-value" "$f" "$l" "ON_DEMAND_API_KEY value present (redacted)"
  done
else
  add info "ondemand-api-key-value" "-" 0 "ON_DEMAND_API_KEY not set in env; value check skipped"
fi

# 3) provider token patterns
scan_regex findings "provider-token" '(ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|vcp_[A-Za-z0-9]{16,}|sk-[A-Za-z0-9]{32,}|AKIA[0-9A-Z]{16})' "$TMP/text"

# 4) INGEST_SECRET with a real 64-hex value
scan_regex findings "ingest-secret-value" 'INGEST_SECRET=[0-9a-f]{64}' "$TMP/text"

# 5) Azure SAS sig= — finding in code dirs, info elsewhere (docs/proof may contain signed URLs)
grep -E '^(src|web/src|scripts|config|web/scripts)/' "$TMP/text" >"$TMP/code" || true
grep -v -E '^(src|web/src|scripts|config|web/scripts)/' "$TMP/text" >"$TMP/noncode" || true
scan_regex findings "azure-sas-sig-in-code" '[?&]sig=[A-Za-z0-9%+/=_-]{20,}' "$TMP/code"
scan_regex info     "azure-sas-sig-in-docs" '[?&]sig=[A-Za-z0-9%+/=_-]{20,}' "$TMP/noncode"

# 6) private keys (anywhere)
scan_regex findings "private-key" 'BEGIN (RSA|EC|OPENSSH|DSA|PGP) PRIVATE KEY' "$TMP/text"

# 7) JWT-looking strings in source dirs (info elsewhere)
scan_regex findings "jwt-in-source" 'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}' "$TMP/code"
scan_regex info     "jwt-in-docs"   'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}' "$TMP/noncode"

# ---- emit JSON
join_json() { if [ -s "$1" ]; then sed '$!s/$/,/' "$1"; fi; }
{
  echo "{"
  echo "  \"generated_utc\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
  echo "  \"commit\": \"$(git rev-parse --short HEAD)\","
  echo "  \"scanned_files\": $SCANNED,"
  echo "  \"findings_count\": $(wc -l <"$FINDINGS" | tr -d ' '),"
  echo "  \"info_count\": $(wc -l <"$INFO" | tr -d ' '),"
  echo "  \"findings\": ["; join_json "$FINDINGS"; echo "  ],"
  echo "  \"info\": [";     join_json "$INFO";     echo "  ]"
  echo "}"
} >"$TMP/out.json"

cat "$TMP/out.json"
if [ -n "$OUT" ]; then mkdir -p "$(dirname "$OUT")"; cp "$TMP/out.json" "$OUT"; fi

if [ -s "$FINDINGS" ]; then
  echo "secret-scan: $(wc -l <"$FINDINGS" | tr -d ' ') finding(s)" >&2
  exit 1
fi
echo "secret-scan: clean ($SCANNED tracked files)" >&2
exit 0
