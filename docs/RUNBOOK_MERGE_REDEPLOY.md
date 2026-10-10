# RUNBOOK — merge 30 parallel worktrees into `main` and redeploy the FE preview

Date: 2026-10-10 · Base: `origin/main @ d6479aa` · Branches: `wt/01` … `wt/30` (worktrees `/tmp/wt-NN`, one commit each, never pushed by agents).
Ledger: `docs/parallel-ledger-2026-10-10.{md,json}` (regenerate with `node web/scripts/ledger.mjs reports.json`).

## 0. Collect reports → ledger (before merging)

```bash
cd /path/to/main-checkout                # the main checkout (NOT a /tmp/wt-NN worktree)
git fetch origin && git status --short    # must be clean
# Build reports.json from the 30 FINAL REPORTs: [{agent, files, tests, result, start, end, commit, notes}]
node web/scripts/ledger.mjs reports.json  # writes docs/parallel-ledger-2026-10-10.md + .json (rows missing stay "pending")
for n in $(seq -w 1 30); do printf "wt/%s  " "$n"; git log --oneline -1 "wt/$n" 2>/dev/null || echo "MISSING"; done
```

A branch with no commit (agent reported `fail`) is skipped — record it in the ledger `notes` column.

## 1. Merge policy

* Integration branch first, `main` last: `git checkout -b integrate/2026-10-10 d6479aa`.
* One `git merge --no-ff wt/NN` per branch, **numeric order 01 → 30**, so the ledger order == history order and a bad merge can be bisected per agent.
* Each agent only touched the files in its scope, so most merges are clean. The known **hotspots** (several agents' scopes overlap) are:
  * `web/src/components/chat/open-intelligent-ui/chat-shell.tsx` (agents 6, 7, 9, 11–14, 19, 22, 23)
  * `web/src/components/chat/open-intelligent-ui/messages.tsx` (agents 9, 10, 11–13, 22)
  * `web/src/components/company/pitchbook-view.tsx` (agents 4, 8, 25, 26)
  * secondary: `stream-store.ts` (9, 11–14), `shell.css` / `canvas.css` (19–24, 28), `settings-form.tsx` (18, 26), `lib/assets.ts` (1–8)
* **Conflict policy** (hotspot files): keep BOTH sides' intent — never pick `--ours`/`--theirs` wholesale. Resolve by reading the two agents' FINAL REPORT "NOTES" + "REQUESTS FOR OTHER FILES"; the later agent's requested edits to another agent's file are applied by hand *after* its merge. Then `tsc` immediately (step 2a) before continuing to the next branch. If a conflict cannot be resolved in ≤10 min: `git merge --abort`, record `deferred` in the ledger, continue; re-attempt that branch at the end on top of everything else.
* Never merge `node_modules`, `.env*`, `package.json`, `package-lock.json`, `proof/**/*.png` from a worktree — if a branch touches them: `git checkout d6479aa -- <file>` during the merge and note it.

```bash
set -euo pipefail
git checkout -b integrate/2026-10-10 d6479aa
for n in $(seq -w 1 30); do
  git rev-parse -q --verify "wt/$n" >/dev/null || { echo "skip wt/$n (no branch)"; continue; }
  [ "$(git rev-list --count d6479aa..wt/$n)" -gt 0 ] || { echo "skip wt/$n (no commits)"; continue; }
  echo "=== merging wt/$n: $(git log --oneline -1 wt/$n)"
  if ! git merge --no-ff --no-edit "wt/$n"; then
    git diff --name-only --diff-filter=U            # list conflicts; resolve by hand (policy above)
    echo "RESOLVE CONFLICTS for wt/$n, then: git add <files> && git commit --no-edit"; exit 1
  fi
  git diff --name-only d6479aa..HEAD | grep -E '^(node_modules|\.env|package(-lock)?\.json$|web/package(-lock)?\.json$)' && { echo "forbidden file merged from wt/$n — revert it"; exit 1; } || true
  ( cd web && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json ) || { echo "tsc broke at wt/$n"; exit 1; }
done
```

Resume after a manual resolution by re-running the loop from the next number (edit `seq -w <next> 30`).

## 2. Gates (all must pass on `integrate/2026-10-10` before it becomes `main`)

```bash
cd web
# 2a typecheck (0 errors)
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
# 2b eventmap unit test
npm run test:eventmap
# 2c production build (ONLY here — never in worktrees) + BUILD_ID
npm run build && cat .next/BUILD_ID
# 2d secret scan (no apikey / tokens in the tree)
git grep -nE '(apikey|api_key|VERCEL_TOKEN|ANTHROPIC|OPENAI)[A-Z_]*\s*[:=]\s*["'"'"'][A-Za-z0-9_\-]{16,}' -- . ':!node_modules' ':!*.lock' || echo "secret scan clean"
# 2e Agent 29 gates (headless broken-image count, rail width ≤224, last company row reachable, zero blue) — see its spec/report
# 2f brand: zero blue in src/public (Agent 28)
git grep -niE '#(0000ff|1e40af|2563eb|3b82f6|60a5fa|93c5fd|dbeafe|eff6ff)|\bblue-[0-9]{2,3}\b' -- web/src web/public || echo "no blue"
```

Playwright runs against the **NEW** deploy (step 4), not here.

## 3. Promote to main

```bash
git checkout main && git merge --ff-only integrate/2026-10-10
git push origin main
git rev-parse --short HEAD    # → ledger "Merged main sha"
```

## 4. FE redeploy (ephemeral Vercel sandbox — never `vercel deploy` / `--prod`)

The running sandbox already has `node_modules` and `rebuild.sh`; we ship a source tarball, extract it over the app root, and rebuild. Set `SANDBOX_ID` to the live FE sandbox (current old build: `https://sb-6aate8kggetp.vercel.run`) or create a new one.

```bash
cd web
# 4a tarball of source only (no node_modules / .next / proof pngs / env)
tar czf /tmp/fe-src.tgz \
  --exclude='proof/**/*.png' --exclude='proof/**/*.webm' --exclude='test-results' --exclude='playwright-report' \
  src public e2e tests scripts next.config.* postcss.config.* tsconfig.json components.json eslint.config.* playwright.config.ts package.json package-lock.json .env 2>/dev/null \
  || tar czf /tmp/fe-src.tgz src public e2e tests scripts tsconfig.json playwright.config.ts package.json package-lock.json
ls -la /tmp/fe-src.tgz

# 4b existing sandbox alive?  (2xx → reuse; else create)
curl -fsS -m 8 -o /dev/null -w '%{http_code}\n' "$PREVIEW_URL" || echo "sandbox dead → sandbox create --runtime node22 --publish-port 3000"

# 4c copy + extract + rebuild (rebuild.sh = npm install (if lock changed) → next build → restart `next start` on :3000, logs /tmp/dev.log)
sandbox copy /tmp/fe-src.tgz "$SANDBOX_ID":/vercel/sandbox/fe-src.tgz
sandbox exec --workdir /vercel/sandbox "$SANDBOX_ID" bash -lc 'tar xzf fe-src.tgz && rm fe-src.tgz && set -a && [ -f .env ] && . ./.env; set +a; bash rebuild.sh'

# 4d BUILD_ID capture — must equal the local one from 2c, prove the new code is live
sandbox exec --workdir /vercel/sandbox "$SANDBOX_ID" bash -lc 'cat .next/BUILD_ID; curl -fsS -o /dev/null -w "%{http_code}\n" http://localhost:3000/chat'
```

If `rebuild.sh` is missing in the sandbox, its contents are: `npm ci --no-audit --no-fund 2>/dev/null || npm install; npm run build; pkill -f "next start" || true; nohup npm run start > /tmp/dev.log 2>&1 &`.

Record in the ledger footer: merged sha, `BUILD_ID`, preview URL (`node web/scripts/ledger.mjs reports.json --merged-sha <sha> --build-id <id> --preview-url <url>`).

## 5. Post-deploy verification (against the NEW preview)

```bash
cd web
export BASE_URL="$PREVIEW_URL"
P="node node_modules/@playwright/test/cli.js test -c playwright.config.ts"
# proof screenshots — "after" set (run the same with PROOF_LABEL=before against the OLD preview first, for the pairing)
PROOF_LABEL=after $P e2e/proof-screens.spec.ts --project=desktop
cat proof/screens/after/index.json | node -e 'const r=JSON.parse(require("fs").readFileSync(0,"utf8"));console.table(r.map(({name,ok,note})=>({name,ok,note:note.slice(0,80)})))'
# new specs written by agents (robust, soft-skip on missing live data) + the existing suite
$P --project=desktop
$P e2e/mobile.spec.ts --project=mobile
SKIP_CHAT=1 $P e2e/chat.spec.ts --project=desktop   # live chat is a 40–80 s Perplexity call; Perplexity is OUT OF CREDITS → expect the honest error card, not prose
```

Any `ok:false` row in `proof/screens/after/index.json` whose note says a testid is absent means that agent's change did **not** land in the build — check the merge for that branch (ledger row) before signing off.

## 6. Rollback

```bash
git checkout main && git reset --hard d6479aa && git push --force-with-lease origin main   # or: git revert -m 1 <merge sha> per branch
# redeploy: repeat §4 from the reverted tree
```

## Checklist

- [ ] 30 FINAL REPORTs → `reports.json` → `node web/scripts/ledger.mjs reports.json`
- [ ] `integrate/2026-10-10` = `d6479aa` + 30 × `merge --no-ff wt/NN` (hotspot conflicts resolved per policy, `tsc` green after each)
- [ ] Gates 2a–2f green; local `BUILD_ID` noted
- [ ] `main` fast-forwarded + pushed
- [ ] tarball → `sandbox copy` → `tar xzf` → `bash rebuild.sh`; sandbox `BUILD_ID` == local
- [ ] `proof/screens/before` (old preview) and `proof/screens/after` (new preview) captured; `index.json` reviewed
- [ ] Ledger footer filled (merged sha / BUILD_ID / preview URL)
