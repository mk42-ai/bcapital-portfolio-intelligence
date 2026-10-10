#!/usr/bin/env bash
# gates.sh — release gates for web/. Run from anywhere: `bash web/scripts/gates.sh`.
#
#   tsc          node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
#   next_build   node node_modules/next/dist/bin/next build          (SKIP_BUILD=1 → "skip")
#   secret_scan  node scripts/secret-scan.mjs                          (uses BASE_URL when set)
#   playwright   BASE_URL=… playwright test e2e/gates.spec.ts --project=desktop --reporter=json
#                → broken_images, rail_width_px, last_row_reachable from test annotations
#
# Env: BASE_URL (live origin for the browser gates + live secret scan; required for the playwright gate),
#      SKIP_BUILD=1 (skip next build), SKIP_PLAYWRIGHT=1, CHROME_PATH (passed through to playwright.config.ts).
# Prints one line per gate (PASS/FAIL/SKIP) and a final JSON summary line prefixed "GATES_SUMMARY ".
# Exit code: 0 only when no gate FAILed.
set -u
cd "$(dirname "$0")/.." || exit 2
WEB="$(pwd)"
LOG_DIR="${GATES_LOG_DIR:-/tmp/bcap-gates}"   # not under test-results/ — Playwright wipes that dir on start
mkdir -p "$LOG_DIR"

tsc="fail"; next_build="fail"; secret_scan="fail"
broken_images="null"; rail_width_px="null"; last_row_reachable="null"
playwright_passed=0; playwright_total=0
FAILED=0

line() { printf '%-14s %s\n' "$1" "$2"; }

# ---- 1. tsc ----
if node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json > "$LOG_DIR/tsc.log" 2>&1; then
  tsc="pass"; line "tsc" "PASS (0 errors)"
else
  n=$(grep -c "error TS" "$LOG_DIR/tsc.log" || true); line "tsc" "FAIL ($n errors; see $LOG_DIR/tsc.log)"; FAILED=1
fi

# ---- 2. next build ----
if [ "${SKIP_BUILD:-0}" = "1" ]; then
  next_build="skip"; line "next_build" "SKIP (SKIP_BUILD=1)"
else
  if node node_modules/next/dist/bin/next build > "$LOG_DIR/next-build.log" 2>&1; then
    next_build="pass"; line "next_build" "PASS"
  else
    next_build="fail"; line "next_build" "FAIL (see $LOG_DIR/next-build.log)"; FAILED=1
  fi
fi

# ---- 3. secret scan ----
if node scripts/secret-scan.mjs > "$LOG_DIR/secret-scan.log" 2>&1; then
  secret_scan="pass"; line "secret_scan" "PASS ($(grep -o '"hits":[0-9]*' "$LOG_DIR/secret-scan.log" | head -1 | tr -d '"'), $(grep -o '"files_scanned":[0-9]*' "$LOG_DIR/secret-scan.log" | head -1 | tr -d '"'), $(grep -o '"live_chunks":[0-9]*' "$LOG_DIR/secret-scan.log" | head -1 | tr -d '"'))"
else
  secret_scan="fail"; line "secret_scan" "FAIL ($(grep -o '"hits":[0-9]*' "$LOG_DIR/secret-scan.log" | head -1 | tr -d '"'); see $LOG_DIR/secret-scan.log)"; FAILED=1
fi

# ---- 4. playwright gates ----
if [ "${SKIP_PLAYWRIGHT:-0}" = "1" ]; then
  line "playwright" "SKIP (SKIP_PLAYWRIGHT=1)"
elif [ -z "${BASE_URL:-}" ]; then
  line "playwright" "SKIP (BASE_URL not set — browser gates need a live origin)"
else
  PW_JSON="$LOG_DIR/gates.json"
  BASE_URL="$BASE_URL" PLAYWRIGHT_JSON_OUTPUT_NAME="$PW_JSON" \
    node node_modules/@playwright/test/cli.js test -c playwright.config.ts e2e/gates.spec.ts --project=desktop --reporter=json \
    > "$LOG_DIR/playwright.log" 2>&1
  pw_exit=$?
  if [ -f "$PW_JSON" ]; then
    read -r playwright_passed playwright_total broken_images rail_width_px last_row_reachable < <(
      node -e '
        const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
        const ann = {}; let passed = 0, total = 0;
        const walk = (s) => { for (const x of s.suites ?? []) walk(x); for (const sp of s.specs ?? []) for (const t of sp.tests ?? []) {
          total++; const res = t.results?.[t.results.length - 1]; const st = res?.status ?? t.status;
          if (st === "passed" || t.status === "expected") passed++;
          for (const a of [...(t.annotations ?? []), ...(res?.annotations ?? [])]) ann[a.type] = a.description;
        } };
        for (const s of r.suites ?? []) walk(s);
        const num = (v) => (v == null || v === "" || isNaN(Number(v)) ? "null" : String(Number(v)));
        const bool = (v) => (v === "true" ? "true" : v === "false" ? "false" : "null");
        console.log([passed, total, num(ann.broken_images), num(ann.rail_width_px), bool(ann.last_row_reachable)].join(" "));
      ' "$PW_JSON"
    )
  fi
  if [ "$pw_exit" -eq 0 ] && [ "$playwright_total" -gt 0 ]; then
    line "playwright" "PASS ($playwright_passed/$playwright_total)"
  else
    line "playwright" "FAIL ($playwright_passed/$playwright_total, exit $pw_exit; see $LOG_DIR/playwright.log)"; FAILED=1
  fi
  [ "$broken_images" = "0" ] && line "broken_images" "PASS (0)" || { line "broken_images" "FAIL ($broken_images)"; FAILED=1; }
  if [ "$rail_width_px" != "null" ] && [ "$rail_width_px" -le 224 ]; then line "rail_width" "PASS (${rail_width_px}px ≤ 224)"; else line "rail_width" "FAIL (${rail_width_px}px)"; FAILED=1; fi
  [ "$last_row_reachable" = "true" ] && line "last_row" "PASS" || { line "last_row" "FAIL ($last_row_reachable)"; FAILED=1; }
fi

printf 'GATES_SUMMARY {"tsc":"%s","next_build":"%s","secret_scan":"%s","broken_images":%s,"rail_width_px":%s,"last_row_reachable":%s,"playwright_passed":%s,"playwright_total":%s}\n' \
  "$tsc" "$next_build" "$secret_scan" "$broken_images" "$rail_width_px" "$last_row_reachable" "$playwright_passed" "$playwright_total"
exit $FAILED
