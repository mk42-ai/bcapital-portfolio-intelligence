#!/usr/bin/env node
// a45 — Playwright suite runner with a hard wall-clock cap + per-spec × project aggregation.
//
//   cd web && BASE_URL=https://<frontend> API_URL=https://<backend> ON_DEMAND_API_KEY=… \
//     node scripts/run-suite.mjs [--label suite-baseline] [--cap-min 18] [--grep "routes-clean|chip-overlap"] \
//                                [--config playwright.evidence.config.ts] [--project evidence-desktop] [--out proof/pass-3/<label>]
//
// Runs `node node_modules/@playwright/test/cli.js test -c <config> --workers=1 --reporter=list,json` with BASE_URL / API_URL /
// ON_DEMAND_API_KEY passed through, kills the whole process group when the cap elapses (SIGTERM, then SIGKILL after 10 s), and
// ALWAYS writes <out>/{results.json,summary.json,summary.md,run.log}. If the run was capped (or crashed) before the JSON reporter
// flushed, the summary is rebuilt from the list-reporter lines already seen on stdout and marked `partial: true`.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] != null ? args[i + 1] : dflt; };
const LABEL = opt("label", "suite-baseline");
const CAP_MIN = Number(opt("cap-min", "18"));
const GREP = opt("grep", null);
const CONFIG = opt("config", "playwright.evidence.config.ts");
const PROJECT = opt("project", null);
const OUT = path.resolve(WEB, opt("out", path.join("proof", "pass-3", LABEL)));
const NOTE = opt("note", null);
fs.mkdirSync(OUT, { recursive: true });

const RESULTS = path.join(OUT, "results.json");
const RUN_LOG = path.join(OUT, "run.log");
const AGG_ONLY = args.includes("--aggregate-only"); // re-aggregate an existing results.json (no playwright run)
if (!AGG_ONLY) { try { fs.unlinkSync(RESULTS); } catch {} }

const pwArgs = ["node_modules/@playwright/test/cli.js", "test", "-c", CONFIG, "--workers=1", "--reporter=list,json"];
if (GREP) pwArgs.push("--grep", GREP);
if (PROJECT) pwArgs.push("--project", PROJECT);
const env = {
  ...process.env,
  PLAYWRIGHT_JSON_OUTPUT_NAME: RESULTS,
  FORCE_COLOR: "0",
  CI: "1",
  BASE_URL: process.env.BASE_URL ?? "",
  API_URL: process.env.API_URL ?? "",
  ON_DEMAND_API_KEY: process.env.ON_DEMAND_API_KEY ?? "",
};
if (!env.BASE_URL) delete env.BASE_URL;
if (!env.API_URL) delete env.API_URL;
if (!env.ON_DEMAND_API_KEY) delete env.ON_DEMAND_API_KEY;

// Environment shim: the evidence config records video, which needs Playwright's bundled ffmpeg. In the shared agent sandbox the
// ms-playwright cache has no ffmpeg (every test fails with "Executable doesn't exist at …/ffmpeg-1013/ffmpeg-linux"), but the
// system ffmpeg is present → symlink it into the cache instead of downloading (no network, no install).
const ffmpegShim = (() => {
  try {
    const browsers = JSON.parse(fs.readFileSync(path.join(WEB, "node_modules", "playwright-core", "browsers.json"), "utf8"));
    const rev = browsers.browsers?.find((b) => b.name === "ffmpeg")?.revision;
    if (!rev) return "no ffmpeg entry in browsers.json";
    const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(process.env.XDG_CACHE_HOME || path.join(process.env.HOME || "", ".cache"), "ms-playwright");
    const target = path.join(cache, `ffmpeg-${rev}`, "ffmpeg-linux");
    if (fs.existsSync(target)) return `ok (${target})`;
    const sys = ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg"].find((p) => fs.existsSync(p));
    if (!sys) return `missing ${target} and no system ffmpeg — video recording will fail`;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.symlinkSync(sys, target);
    return `symlinked ${sys} → ${target}`;
  } catch (e) { return `shim error: ${e?.message ?? e}`; }
})();

let prev = null; try { prev = JSON.parse(fs.readFileSync(path.join(OUT, "summary.json"), "utf8")); } catch {}
const startedAt = AGG_ONLY && prev?.startedUtc ? new Date(prev.startedUtc) : new Date();
const t0 = Date.now();
let stdout = "", capped = false, exitCode = prev?.exitCode ?? null, wallMs = prev?.wallMs ?? 0;
if (AGG_ONLY) {
  try { stdout = fs.readFileSync(RUN_LOG, "utf8"); } catch {}
  capped = Boolean(prev?.capped);
} else {
const logFd = fs.openSync(RUN_LOG, "w");
const onChunk = (c) => { const s = c.toString(); stdout += s; fs.writeSync(logFd, s); process.stdout.write(s); };

console.log(`[run-suite] ffmpeg shim: ${ffmpegShim}`);
console.log(`[run-suite] ${LABEL} · cap ${CAP_MIN} min · config ${CONFIG}${GREP ? ` · grep ${GREP}` : ""}${PROJECT ? ` · project ${PROJECT}` : ""} · BASE_URL=${env.BASE_URL ?? "(config default)"}`);
const child = spawn(process.execPath, pwArgs, { cwd: WEB, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
child.stdout.on("data", onChunk);
child.stderr.on("data", onChunk);

const killGroup = (sig) => { try { process.kill(-child.pid, sig); } catch { try { child.kill(sig); } catch {} } };
const capTimer = setTimeout(() => {
  capped = true;
  const m = `\n[run-suite] CAP ${CAP_MIN} min reached — killing playwright (SIGTERM, SIGKILL in 10 s)\n`;
  onChunk(m);
  killGroup("SIGTERM");
  setTimeout(() => killGroup("SIGKILL"), 10_000).unref();
}, CAP_MIN * 60_000);
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { capped = true; killGroup("SIGTERM"); });

exitCode = await new Promise((res) => child.on("exit", (code, sig) => res(code ?? `signal:${sig}`)));
clearTimeout(capTimer);
wallMs = Date.now() - t0;
fs.closeSync(logFd);
}

// ---------- aggregation ----------
const firstErrorLine = (err) => {
  const msg = (err?.message ?? err?.value ?? "").replace(/\u001b\[[0-9;]*m/g, "");
  const line = msg.split("\n").map((l) => l.trim()).find((l) => l && !/^at /.test(l));
  return (line ?? "").slice(0, 240);
};
const cells = new Map(); // key spec|project -> cell
const cell = (spec, project) => {
  const k = `${spec}|${project}`;
  if (!cells.has(k)) cells.set(k, { spec, project, passed: 0, failed: 0, skipped: 0, flaky: 0, timedOut: 0, durationMs: 0, failures: [] });
  return cells.get(k);
};
let partial = false, totals = { passed: 0, failed: 0, skipped: 0, flaky: 0, timedOut: 0 }, source = "results.json";

const walkSuite = (suite, file) => {
  const f = suite.file ?? file;
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      const c = cell(path.basename(f), test.projectName ?? test.projectId ?? "?");
      const status = test.status; // expected | unexpected | flaky | skipped
      const dur = (test.results ?? []).reduce((a, r) => a + (r.duration ?? 0), 0);
      c.durationMs += dur;
      if (status === "expected") { c.passed++; totals.passed++; }
      else if (status === "skipped") { c.skipped++; totals.skipped++; }
      else if (status === "flaky") { c.flaky++; totals.flaky++; c.failures.push({ title: spec.title, status: "flaky", error: firstErrorLine(test.results?.find((r) => r.status !== "passed")?.error) }); }
      else {
        const r = test.results?.[test.results.length - 1];
        const timedOut = r?.status === "timedOut";
        c.failed++; totals.failed++; if (timedOut) { c.timedOut++; totals.timedOut++; }
        c.failures.push({ title: spec.title, status: timedOut ? "timedOut" : "failed", durationMs: r?.duration ?? null, error: firstErrorLine(r?.error ?? r?.errors?.[0]) });
      }
    }
  }
  for (const s of suite.suites ?? []) walkSuite(s, f);
};

let json = null;
try { json = JSON.parse(fs.readFileSync(RESULTS, "utf8")); } catch {}
if (json?.suites) {
  for (const s of json.suites) walkSuite(s, s.file);
} else {
  // Fallback: rebuild from list-reporter lines ("  ✓  3 [evidence-desktop] › routes-clean.spec.ts:10:5 › title (4.2s)").
  partial = true; source = "list-reporter stdout (json reporter did not flush — capped or crashed)";
  const re = /^\s*(✓|✘|-|ok|x|skipped)?\s*\d+\s+\[([^\]]+)\]\s+›\s+([^\s:›]+\.spec\.ts)[^›]*›\s+(.+?)(?:\s+\((\d+(?:\.\d+)?)(ms|s|m)\))?\s*$/;
  for (const raw of stdout.split("\n")) {
    const m = raw.replace(/\u001b\[[0-9;]*m/g, "").match(re);
    if (!m) continue;
    const [, mark, project, file, title, n, unit] = m;
    const c = cell(path.basename(file), project);
    const dur = n ? Number(n) * (unit === "s" ? 1000 : unit === "m" ? 60000 : 1) : 0;
    c.durationMs += dur;
    if (mark === "✓" || mark === "ok") { c.passed++; totals.passed++; }
    else if (mark === "-" || mark === "skipped") { c.skipped++; totals.skipped++; }
    else { c.failed++; totals.failed++; c.failures.push({ title, status: "failed", durationMs: dur, error: "(see run.log — json reporter did not flush)" }); }
  }
}
if (capped) partial = true;

const rows = [...cells.values()].sort((a, b) => a.spec.localeCompare(b.spec) || a.project.localeCompare(b.project));
const summary = {
  label: LABEL, note: NOTE, startedUtc: startedAt.toISOString(), finishedUtc: AGG_ONLY && prev?.finishedUtc ? prev.finishedUtc : new Date().toISOString(), wallMs, capMin: CAP_MIN, capped, partial, source,
  exitCode, ffmpegShim, config: CONFIG, grep: GREP, project: PROJECT, baseUrl: env.BASE_URL ?? prev?.baseUrl ?? null, apiUrl: env.API_URL ?? prev?.apiUrl ?? null,
  totals: { ...totals, tests: rows.reduce((a, r) => a + r.passed + r.failed + r.skipped + r.flaky, 0) },
  rows,
};
fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 2));

const sec = (ms) => `${(ms / 1000).toFixed(1)}s`;
const md = [];
md.push(`# Suite run — ${LABEL}`, "");
if (NOTE) md.push(`> ${NOTE}`, "");
md.push(`- started ${summary.startedUtc} · finished ${summary.finishedUtc} · wall ${sec(wallMs)} · cap ${CAP_MIN} min${capped ? " · **CAPPED**" : ""}${partial ? " · **PARTIAL**" : ""}`);
md.push(`- config \`${CONFIG}\`${GREP ? ` · grep \`${GREP}\`` : ""}${PROJECT ? ` · project \`${PROJECT}\`` : ""} · exit ${exitCode} · source: ${source}`);
md.push(`- frontend ${summary.baseUrl ?? "(config default)"} · backend ${summary.apiUrl ?? "(config default)"}`);
md.push(`- totals: **${totals.passed} passed / ${totals.failed} failed (${totals.timedOut} timed out) / ${totals.flaky} flaky / ${totals.skipped} skipped** of ${summary.totals.tests}`, "");
md.push("| spec | project | passed | failed | flaky | skipped | duration |", "|---|---|---:|---:|---:|---:|---:|");
for (const r of rows) md.push(`| ${r.spec} | ${r.project} | ${r.passed} | ${r.failed}${r.timedOut ? ` (${r.timedOut} timeout)` : ""} | ${r.flaky} | ${r.skipped} | ${sec(r.durationMs)} |`);
const fails = rows.flatMap((r) => r.failures.map((f) => ({ ...f, spec: r.spec, project: r.project })));
md.push("", `## Failures (${fails.length})`, "");
if (!fails.length) md.push("none");
else { md.push("| spec | project | test | status | first error line |", "|---|---|---|---|---|"); for (const f of fails) md.push(`| ${f.spec} | ${f.project} | ${f.title} | ${f.status} | ${(f.error || "").replace(/\|/g, "\\|")} |`); }
const TRIAGE = opt("triage", null);
md.push("", "## Triage", "");
if (TRIAGE && fs.existsSync(path.resolve(WEB, TRIAGE))) md.push(fs.readFileSync(path.resolve(WEB, TRIAGE), "utf8").trim(), "");
else md.push("_fill in: app-regression / flaky / environment + one line of evidence per failure (or pass `--triage <file.md>`)_", "");
fs.writeFileSync(path.join(OUT, "summary.md"), md.join("\n"));
console.log(`\n[run-suite] wrote ${path.relative(WEB, OUT)}/{summary.json,summary.md,results.json,run.log} — ${totals.passed} passed / ${totals.failed} failed / ${totals.flaky} flaky / ${totals.skipped} skipped${capped ? " (CAPPED)" : ""}`);
process.exit(capped ? 2 : totals.failed ? 1 : 0);
