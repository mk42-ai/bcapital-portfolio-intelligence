#!/usr/bin/env node
/**
 * Parallel-work ledger: reads a JSON array of agent reports and writes
 *   docs/parallel-ledger-2026-10-10.md   (markdown table)
 *   docs/parallel-ledger-2026-10-10.json (same rows + generated_at + commit)
 *
 * Usage (from repo root or web/):
 *   node web/scripts/ledger.mjs                       # seed: 30 rows, agent 1–30, scope from the split, other fields "pending"
 *   node web/scripts/ledger.mjs reports.json          # fill from reports: [{agent, scope?, files, tests, result, start, end, commit?, notes?}]
 *   node web/scripts/ledger.mjs reports.json --date 2026-10-10 --out docs
 *
 * Rows missing from reports.json stay "pending" (merge is by agent number), so a partial reports file never drops a row.
 * `files`/`tests` may be arrays or strings. `commit` in the JSON header = `git rev-parse --short HEAD` of the cwd (or "unknown").
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

/** The user's 30-way split (scope per agent). Keep in sync with /tmp/agent-tasks/NN.md titles. */
export const SCOPES = {
  1: "asset pipeline, manifest, retire /fallbacks",
  2: "/api/img news fallback uses the news-card asset",
  3: "company logo avatars fall back to the company-logo asset",
  4: "PitchBook financial empty-state per unavailable field",
  5: "voice orb states idle / listening / thinking with the orb assets",
  6: "composer drop-zone + Attach with the upload-dropzone asset",
  7: "empty-thread new-chat canvas",
  8: "synced badge + freshness stamp component",
  9: "inline citation chips rendered live from SSE source events",
  10: "Sources list → compact publisher-first chip row ABOVE the answer",
  11: "awaiting_input interactive card",
  12: "require_creds interactive card (server-side credential post only)",
  13: "awaiting_browser_action interactive card",
  14: "session-resume for interactive cards via the OnDemand API",
  15: "voice plugin parity: pluginIds + sessionId through STT → submit-query → TTS",
  16: "voice parity automated test",
  17: "Playwright record → analyse → fix loop artifacts under docs/proof/",
  18: "Perplexity status banner in Settings, remove red cards",
  19: "8 px grid; remove nested card layout, serif header, subtitle, data-source line, footer on /chat",
  20: "52 px top bar: thread title, model pill, Plan/Run toggle, inspector toggle, freshness dot",
  21: "collapsible nav rail ≤224/64 px with persisted state + thread list under Chat; delete the \"Portfolio analyst\" column",
  22: "conversation column full width/height, messages ≤800 px centred, bounded/virtualised thread",
  23: "composer pinned bottom with Attach, textarea, mic, send on ONE row + floating scroll-to-bottom",
  24: "inspector slide-over drawer ≤360 px, ONE details reveal, plan rendered once",
  25: "PitchBook synchronous initial render (server data), remove Run now / execution id / executing",
  26: "PitchBook freshness stamp, provenance kept, per-field ask-in-chat into the EXISTING composer, empty-state per field, manual refresh in Settings behind a reveal",
  27: "PitchBook zero-network-on-first-paint test + drawer initial-content test",
  28: "brand audit: #0AC985 green only, zero blue, clean whitespace, responsive 1440×900 / 390×844",
  29: "gates: tsc, next build, secret scan, headless broken-image count, rail width ≤224, last company row reachable",
  30: "screenshot proof spec + ledger scaffolding + merge/redeploy runbook",
};

const PENDING = "pending";
const COLUMNS = ["agent", "scope", "files", "tests", "result", "start", "end", "commit", "notes"];

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const reportsPath = args.find((a) => !a.startsWith("--") && !args[args.indexOf(a) - 1]?.startsWith("--"));
const date = opt("--date", "2026-10-10");
const outDir = path.resolve(ROOT, opt("--out", "docs"));

const asText = (v) => (v == null || v === "" ? PENDING : Array.isArray(v) ? (v.length ? v.join(", ") : PENDING) : String(v));
const cell = (s) => String(s).replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");

function gitCommit() {
  try { return execSync("git rev-parse --short HEAD", { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || "unknown"; }
  catch { return "unknown"; }
}

function loadReports(p) {
  if (!p) return [];
  const raw = JSON.parse(fs.readFileSync(path.resolve(p), "utf8"));
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw.reports) ? raw.reports : [];
  return arr.filter((r) => r && Number.isFinite(Number(r.agent)));
}

function buildRows(reports) {
  const byAgent = new Map(reports.map((r) => [Number(r.agent), r]));
  return Object.keys(SCOPES).map(Number).sort((a, b) => a - b).map((n) => {
    const r = byAgent.get(n) ?? {};
    return {
      agent: n,
      scope: asText(r.scope) === PENDING ? SCOPES[n] : String(r.scope),
      files: asText(r.files),
      tests: asText(r.tests),
      result: asText(r.result),
      start: asText(r.start),
      end: asText(r.end),
      commit: asText(r.commit),
      notes: asText(r.notes),
    };
  });
}

function renderMd(rows, meta) {
  const counts = rows.reduce((m, r) => { const k = r.result.split(/\s/)[0].toLowerCase(); m[k] = (m[k] ?? 0) + 1; return m; }, {});
  const summary = Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(" · ");
  const lines = [
    `# Parallel work ledger — ${meta.date}`,
    "",
    `Generated \`${meta.generated_at}\` at commit \`${meta.commit}\` by \`web/scripts/ledger.mjs\`${meta.source ? ` from \`${meta.source}\`` : " (seed — no reports yet)"}.`,
    `30 agents, one worktree each (\`/tmp/wt-NN\`, branch \`wt/NN\`, branched from \`d6479aa\`). Summary: ${summary}.`,
    "",
    "Columns: **files** = files touched (explicit paths), **tests** = tests added/run with results, **result** = pass | partial | fail (+why), **start/end** = UTC, **commit** = sha on `wt/NN`.",
    "",
    `| ${COLUMNS.map((c) => c[0].toUpperCase() + c.slice(1)).join(" | ")} |`,
    `| ${COLUMNS.map((c) => (c === "agent" ? "--:" : "---")).join(" | ")} |`,
    ...rows.map((r) => `| ${COLUMNS.map((c) => cell(r[c])).join(" | ")} |`),
    "",
    "## Merge order & gates",
    "",
    "See `docs/RUNBOOK_MERGE_REDEPLOY.md` — merge each `wt/NN` with `--no-ff` in numeric order, re-run the gates (tsc, eventmap unit test, Playwright against the NEW deploy, Agent 29 gates), then deploy and record `BUILD_ID` below.",
    "",
    `- Merged main sha: ${meta.merged_sha ?? PENDING}`,
    `- FE BUILD_ID: ${meta.build_id ?? PENDING}`,
    `- Preview URL: ${meta.preview_url ?? PENDING}`,
    "",
  ];
  return lines.join("\n");
}

function main() {
  const reports = loadReports(reportsPath);
  const rows = buildRows(reports);
  const meta = {
    date,
    generated_at: new Date().toISOString(),
    commit: gitCommit(),
    source: reportsPath ? path.relative(ROOT, path.resolve(reportsPath)) : null,
    merged_sha: opt("--merged-sha", null),
    build_id: opt("--build-id", null),
    preview_url: opt("--preview-url", null),
  };
  fs.mkdirSync(outDir, { recursive: true });
  const mdPath = path.join(outDir, `parallel-ledger-${date}.md`);
  const jsonPath = path.join(outDir, `parallel-ledger-${date}.json`);
  fs.writeFileSync(mdPath, renderMd(rows, meta));
  fs.writeFileSync(jsonPath, JSON.stringify({ ...meta, agents: rows.length, reports: rows }, null, 2) + "\n");
  console.log(`ledger: ${rows.length} rows (${reports.length} from reports) → ${path.relative(ROOT, mdPath)}, ${path.relative(ROOT, jsonPath)} @ ${meta.commit}`);
}

main();
