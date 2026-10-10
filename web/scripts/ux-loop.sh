#!/usr/bin/env bash
# Record → analyse → fix loop. Usage:
#   bash web/scripts/ux-loop.sh <label> <base_url>          e.g.  bash web/scripts/ux-loop.sh before https://sb-6aate8kggetp.vercel.run
#   RUN_LABEL=after BASE_URL=https://… bash web/scripts/ux-loop.sh      (env form)
# Steps: (1) Playwright run-ux recorder (playwright.ux.config.ts: trace:on, video:on) for desktop + mobile
#        (2) tests/e2e/score.mjs <label>  → smoothness score
#        (3) copy the proof set into docs/proof/<label>/{timeline.json,score.json,screenshot.png,video.webm,trace.zip} (+ per-viewport extras)
#        (4) if docs/proof/before AND docs/proof/after exist → tests/e2e/compare.mjs before after → docs/proof/compare.md
# Options: PROJECTS="desktop mobile" (default both) · VIDEO_MAX_S=60 (ffmpeg trim; 0 = keep) · SKIP_RECORD=1 (re-score/copy from existing web/artifacts)
set -euo pipefail
LABEL="${1:-${RUN_LABEL:-before}}"
BASE_URL="${2:-${BASE_URL:-}}"
WEB="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="$(cd "$WEB/.." && pwd)"
ART="$WEB/artifacts"
PROOF="$ROOT/docs/proof/$LABEL"
PROJECTS="${PROJECTS:-desktop mobile}"
VIDEO_MAX_S="${VIDEO_MAX_S:-60}"
[ -n "$BASE_URL" ] || { echo "usage: $0 <label> <base_url>" >&2; exit 2; }
echo "[ux-loop] label=$LABEL base=$BASE_URL projects=$PROJECTS start=$(date -u +%Y-%m-%dT%H:%M:%SZ)"

cd "$WEB"
if [ "${SKIP_RECORD:-0}" != "1" ]; then
  rm -rf "$ART/$LABEL" "$ART"/*-"$LABEL"-*.json "$ART"/*-"$LABEL"-*.jsonl "$ART/smoothness-$LABEL.json" 2>/dev/null || true
  mkdir -p "$ART"
  args=(); for p in $PROJECTS; do args+=(--project="$p"); done
  # video:on needs Playwright's own ffmpeg build (downloaded to the Playwright cache, not the repo) — install once if absent
  node -e 'const {registry}=require("playwright-core/lib/server");const f=registry.findExecutable("ffmpeg");process.exit(f&&f.executablePathOrDie?0:1)' 2>/dev/null \
    && node -e 'const {registry}=require("playwright-core/lib/server");registry.findExecutable("ffmpeg").executablePathOrDie()' >/dev/null 2>&1 \
    || node node_modules/@playwright/test/cli.js install ffmpeg >/dev/null 2>&1 || echo "[ux-loop] WARN: playwright ffmpeg install failed — video may be skipped"
  # the recorder uses expect.soft; a non-zero exit (soft failures / stream timeout) still leaves full artifacts, so do not abort the loop
  RUN_LABEL="$LABEL" BASE_URL="$BASE_URL" node node_modules/@playwright/test/cli.js test -c playwright.ux.config.ts "${args[@]}" || echo "[ux-loop] recorder exited non-zero (soft failures recorded in artifacts/$LABEL/results.json)"
fi

node tests/e2e/score.mjs "$LABEL"

# ---- assemble docs/proof/<label> ---------------------------------------------------------------------------------------
mkdir -p "$PROOF"
node - "$ART" "$LABEL" "$PROOF" "$BASE_URL" <<'EOF'
const fs = require("node:fs"), path = require("node:path");
const [ART, LABEL, PROOF, BASE] = process.argv.slice(2);
const viewports = {};
for (const vp of ["desktop", "mobile"]) { const f = path.join(ART, `compact-${LABEL}-${vp}.json`); if (fs.existsSync(f)) viewports[vp] = JSON.parse(fs.readFileSync(f, "utf8")); }
const out = { schema: "ux-proof-timeline/1", label: LABEL, base_url: BASE, generated_utc: new Date().toISOString(), viewports };
fs.writeFileSync(path.join(PROOF, "timeline.json"), JSON.stringify(out, null, 2));
const sc = path.join(ART, `smoothness-${LABEL}.json`); if (fs.existsSync(sc)) fs.copyFileSync(sc, path.join(PROOF, "score.json"));
console.log(`[ux-loop] timeline.json viewports=${Object.keys(viewports).join(",") || "none"}`);
EOF

# screenshot.png = desktop final shot (mobile kept as screenshot-mobile.png)
[ -f "$ART/$LABEL/final-desktop.png" ] && cp "$ART/$LABEL/final-desktop.png" "$PROOF/screenshot.png"
[ -f "$ART/$LABEL/final-mobile.png" ] && cp "$ART/$LABEL/final-mobile.png" "$PROOF/screenshot-mobile.png"
# milestone screenshots (small pngs) — keep the chat/error/final ones
mkdir -p "$PROOF/screenshots"; for f in "$ART/$LABEL"/screenshots/*.png; do [ -f "$f" ] && cp "$f" "$PROOF/screenshots/"; done; rmdir "$PROOF/screenshots" 2>/dev/null || true

# A full trace (screencast frame per repaint + embedded video + every image resource) is 200–300 MB; slim it to ≤ TRACE_MAX_MB (default 8):
# drop the embedded video attachment and resources > 150 KB, keep trace/network/stacks/src/DOM snapshots intact, subsample screencast frames.
slim_trace() { # <in.zip> <out.zip> <max_mb>
  if ! command -v python3 >/dev/null 2>&1; then echo "[ux-loop] WARN: python3 missing — trace not slimmed, skipped ($(du -h "$1" | cut -f1))"; return 0; fi
  python3 - "$1" "$2" "$3" <<'PY'
import sys, zipfile
src, dst, max_mb = sys.argv[1], sys.argv[2], float(sys.argv[3])
zin = zipfile.ZipFile(src); infos = zin.infolist()
keep = [i for i in infos if not i.filename.startswith(("screencast/", "attachments/")) and not (i.filename.startswith("resources/") and i.file_size > 150_000)]
base = sum(i.compress_size for i in keep)
frames = sorted((i for i in infos if i.filename.startswith("screencast/")), key=lambda i: i.filename)
budget = max(0, max_mb * 1024 * 1024 * 0.9 - base)
avg = (sum(i.compress_size for i in frames) / len(frames)) if frames else 1
n_keep = int(budget // avg) if avg else 0
step = max(1, -(-len(frames) // n_keep)) if n_keep > 0 else 0
sel = frames[::step] if step else []
with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
    for i in keep + sel: zout.writestr(i, zin.read(i.filename))
import os; print(f"[ux-loop] trace slimmed {os.path.getsize(src)//1048576} MB -> {os.path.getsize(dst)//1048576} MB (kept {len(keep)} entries + {len(sel)}/{len(frames)} screencast frames, every {step})")
PY
}

# trace.zip + video.webm per project (the Playwright output dir is artifacts/<label>/pw/<test-dir>/)
for p in $PROJECTS; do
  dir="$(find "$ART/$LABEL/pw" -maxdepth 1 -type d -name "*-${p}" 2>/dev/null | head -1 || true)"
  [ -n "$dir" ] || continue
  suffix=""; [ "$p" = "desktop" ] || suffix="-$p"
  tr="$(find "$dir" -maxdepth 1 -name 'trace*.zip' | head -1 || true)"; [ -n "$tr" ] && slim_trace "$tr" "$PROOF/trace$suffix.zip" "${TRACE_MAX_MB:-8}"
  vid="$(find "$dir" -maxdepth 1 -name '*.webm' | head -1 || true)"
  if [ -n "$vid" ]; then
    if [ "$VIDEO_MAX_S" != "0" ] && command -v ffmpeg >/dev/null 2>&1; then
      ffmpeg -nostdin -loglevel error -y -i "$vid" -t "$VIDEO_MAX_S" -c:v libvpx -b:v 600k -an "$PROOF/video$suffix.webm" || cp "$vid" "$PROOF/video$suffix.webm"
    else cp "$vid" "$PROOF/video$suffix.webm"; fi
  fi
done

# ---- size guard (≤ 25 MB total for docs/proof) --------------------------------------------------------------------------
total_kb=$(du -sk "$ROOT/docs/proof" | cut -f1)
if [ "$total_kb" -gt 25600 ]; then
  echo "[ux-loop] docs/proof is ${total_kb} KB (>25 MB) — dropping mobile video/trace, then re-trimming"
  rm -f "$PROOF/video-mobile.webm" "$PROOF/trace-mobile.zip"
  total_kb=$(du -sk "$ROOT/docs/proof" | cut -f1)
  if [ "$total_kb" -gt 25600 ] && command -v ffmpeg >/dev/null 2>&1 && [ -f "$PROOF/video.webm" ]; then
    ffmpeg -nostdin -loglevel error -y -i "$PROOF/video.webm" -t 30 -c:v libvpx -b:v 300k -vf scale=720:-2 -an "$PROOF/video.tmp.webm" && mv "$PROOF/video.tmp.webm" "$PROOF/video.webm"
  fi
fi
echo "[ux-loop] docs/proof/$LABEL:"; ls -la "$PROOF"; echo "[ux-loop] docs/proof total: $(du -sh "$ROOT/docs/proof" | cut -f1)"

# ---- compare when both passes exist ------------------------------------------------------------------------------------
if [ -f "$ROOT/docs/proof/before/timeline.json" ] && [ -f "$ROOT/docs/proof/after/timeline.json" ]; then
  node tests/e2e/compare.mjs before after && echo "[ux-loop] wrote docs/proof/compare.md"
else
  echo "[ux-loop] compare skipped (need both docs/proof/before and docs/proof/after)"
fi
echo "[ux-loop] done $(date -u +%Y-%m-%dT%H:%M:%SZ)"
