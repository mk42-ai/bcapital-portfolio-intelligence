#!/usr/bin/env node
// Lighthouse route runner + budget gate (pass-3).
// Usage: BASE_URL=https://… LABEL=before PRESETS=desktop,mobile node scripts/lighthouse-routes.mjs
//   ROUTES   comma list (default: /overview,/companies,/news,/chat?skip=1,/artifacts,/settings)
//   PRESETS  comma list of desktop|mobile (default: desktop,mobile)
//   MERGE=1  keep rows of other presets already in summary.json (re-run one preset only)
//   RUN_CAP_MS per-run cap (default 90000); CHROME_PATH (default /usr/bin/chromium)
// Writes proof/pass-3/lighthouse/<label>/{summary.json,summary.md,<preset>-<route>.json} and exits 1 if any route fails the budget.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..");
const BASE = (process.env.BASE_URL ?? "https://sb-1gizcktepfgc.vercel.run").replace(/\/$/, "");
const LABEL = process.env.LABEL ?? "before";
const ROUTES = (process.env.ROUTES ?? "/overview,/companies,/news,/chat?skip=1,/artifacts,/settings").split(",").map((s) => s.trim()).filter(Boolean);
const PRESETS = (process.env.PRESETS ?? "desktop,mobile").split(",").map((s) => s.trim()).filter((p) => p === "desktop" || p === "mobile");
const RUN_CAP_MS = Number(process.env.RUN_CAP_MS ?? 90_000);
const CHROME_PATH = process.env.CHROME_PATH ?? "/usr/bin/chromium";
const LH_CLI = path.join(webRoot, "node_modules/lighthouse/cli/index.js");
const budget = JSON.parse(fs.readFileSync(path.join(webRoot, "lighthouse-budget.json"), "utf8"));
const outDir = path.join(webRoot, "proof/pass-3/lighthouse", LABEL);
fs.mkdirSync(outDir, { recursive: true });

if (!fs.existsSync(LH_CLI)) { console.error(`lighthouse CLI not found at ${LH_CLI}`); process.exit(2); }

const slug = (r) => r.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-").replace(/-+$/, "") || "root";
const num = (a, id) => (a?.[id]?.numericValue != null ? a[id].numericValue : null);
const score = (c, id) => (c?.[id]?.score != null ? Math.round(c[id].score * 100) : null);

function runOne(url, preset, outPath) {
  return new Promise((resolve) => {
    const args = [LH_CLI, url,
      `--chrome-flags=--headless=new --no-sandbox --disable-dev-shm-usage --disable-gpu`,
      ...(preset === "desktop" ? ["--preset=desktop"] : []), // mobile = Lighthouse default (Moto G Power + 4G slow throttling)
      "--only-categories=performance,accessibility,best-practices",
      "--output=json", `--output-path=${outPath}`, "--quiet", "--max-wait-for-load=45000"];
    const t0 = Date.now();
    const child = spawn(process.execPath, args, { cwd: webRoot, env: { ...process.env, CHROME_PATH }, stdio: ["ignore", "ignore", "pipe"], detached: true });
    let stderr = "";
    child.stderr.on("data", (d) => { stderr += d; });
    const timer = setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch {} resolve({ ok: false, error: `timeout after ${RUN_CAP_MS} ms`, ms: Date.now() - t0 }); }, RUN_CAP_MS);
    child.on("exit", (code) => { clearTimeout(timer); resolve({ ok: code === 0 && fs.existsSync(outPath), code, error: code === 0 ? null : stderr.trim().split("\n").slice(-3).join(" | "), ms: Date.now() - t0 }); });
  });
}

function evaluate(row) {
  const fails = [];
  if (row.performance != null && row.performance < budget.performance) fails.push(`perf ${row.performance}<${budget.performance}`);
  if (row.accessibility != null && row.accessibility < budget.accessibility) fails.push(`a11y ${row.accessibility}<${budget.accessibility}`);
  if (row.lcp_ms != null && row.lcp_ms > budget.lcp_ms) fails.push(`LCP ${row.lcp_ms}>${budget.lcp_ms}`);
  if (row.tbt_ms != null && row.tbt_ms > budget.tbt_ms) fails.push(`TBT ${row.tbt_ms}>${budget.tbt_ms}`);
  if (row.cls != null && row.cls > budget.cls) fails.push(`CLS ${row.cls}>${budget.cls}`);
  if (row.error) fails.push(`run error: ${row.error}`);
  return fails;
}

const summaryPath = path.join(outDir, "summary.json");
const prior = process.env.MERGE === "1" && fs.existsSync(summaryPath) ? JSON.parse(fs.readFileSync(summaryPath, "utf8")).results.filter((r) => !PRESETS.includes(r.preset)) : [];
const summary = { label: LABEL, base: BASE, at: new Date().toISOString(), tool: "lighthouse", version: JSON.parse(fs.readFileSync(path.join(webRoot, "node_modules/lighthouse/package.json"), "utf8")).version, budget, presets: PRESETS, results: [] };
for (const preset of PRESETS) {
  for (const route of ROUTES) {
    const url = `${BASE}${route}`;
    const file = path.join(outDir, `${preset}-${slug(route)}.json`);
    const t = await runOne(url, preset, file);
    const row = { preset, route, url, performance: null, accessibility: null, best_practices: null, lcp_ms: null, tbt_ms: null, cls: null, fcp_ms: null, si_ms: null, run_ms: t.ms, error: t.ok ? null : t.error };
    if (t.ok) {
      try {
        const lhr = JSON.parse(fs.readFileSync(file, "utf8"));
        if (lhr.runtimeError) row.error = `${lhr.runtimeError.code}: ${lhr.runtimeError.message}`;
        const c = lhr.categories, a = lhr.audits;
        Object.assign(row, { performance: score(c, "performance"), accessibility: score(c, "accessibility"), best_practices: score(c, "best-practices"),
          lcp_ms: Math.round(num(a, "largest-contentful-paint") ?? NaN) || null, tbt_ms: Math.round(num(a, "total-blocking-time") ?? NaN) ?? null, cls: num(a, "cumulative-layout-shift") != null ? +num(a, "cumulative-layout-shift").toFixed(3) : null,
          fcp_ms: Math.round(num(a, "first-contentful-paint") ?? NaN) || null, si_ms: Math.round(num(a, "speed-index") ?? NaN) || null });
        if (row.tbt_ms != null && Number.isNaN(row.tbt_ms)) row.tbt_ms = null;
        row.failing_a11y = Object.values(a).filter((x) => x.score != null && x.score < 1 && c.accessibility?.auditRefs.some((ref) => ref.id === x.id)).map((x) => x.id);
      } catch (e) { row.error = `parse: ${e.message}`; }
    }
    row.fails = evaluate(row);
    row.status = row.fails.length ? "FAIL" : "PASS";
    summary.results.push(row);
    console.log(`[${row.status}] ${preset} ${route}  perf=${row.performance} a11y=${row.accessibility} bp=${row.best_practices} LCP=${row.lcp_ms} TBT=${row.tbt_ms} CLS=${row.cls} FCP=${row.fcp_ms} SI=${row.si_ms} (${Math.round(t.ms / 1000)}s)${row.fails.length ? "  ← " + row.fails.join("; ") : ""}`);
  }
}
summary.results = [...prior, ...summary.results]; summary.presets = [...new Set(summary.results.map((r) => r.preset))];
summary.pass = summary.results.every((r) => r.status === "PASS");
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
const md = [`# Lighthouse — ${LABEL} (${BASE})`, "", `Lighthouse ${summary.version}, ${summary.at}, presets: ${summary.presets.join(", ")}. Budget: perf ≥${budget.performance}, a11y ≥${budget.accessibility}, LCP ≤${budget.lcp_ms} ms, TBT ≤${budget.tbt_ms} ms, CLS ≤${budget.cls}.`, "",
  "| Preset | Route | Perf | A11y | Best-pr. | LCP ms | TBT ms | CLS | FCP ms | SI ms | Status | Notes |", "|---|---|---|---|---|---|---|---|---|---|---|---|",
  ...summary.results.map((r) => `| ${r.preset} | ${r.route} | ${r.performance ?? "—"} | ${r.accessibility ?? "—"} | ${r.best_practices ?? "—"} | ${r.lcp_ms ?? "—"} | ${r.tbt_ms ?? "—"} | ${r.cls ?? "—"} | ${r.fcp_ms ?? "—"} | ${r.si_ms ?? "—"} | ${r.status} | ${r.fails.join("; ")} |`),
  "", `Overall: **${summary.pass ? "PASS" : "FAIL"}**`, ""].join("\n");
fs.writeFileSync(path.join(outDir, "summary.md"), md);
console.log(`\n${summary.pass ? "PASS" : "FAIL"} — wrote ${path.relative(webRoot, outDir)}/summary.{json,md}`);
process.exit(summary.pass ? 0 : 1);
