#!/usr/bin/env node
// Gate runner (Node 22, no deps). Runs the repo's hard gates sequentially with timestamps,
// prints a table and writes web/proof/pass-3/gates.json. Exit code 1 if any hard gate fails.
//
//   cd web && node scripts/gate.mjs            # tsc root+web, eslint (or skipped), unit suites, secret scan
//   cd web && node scripts/gate.mjs --build    # additionally runs `next build` with web/.env exported (~3 min on 1 CPU)
//   flags: --build  --no-unit  --no-secrets  --json-only  --out <path>
//
// Gates: (1) root tsc  (2) web tsc  (3) eslint  (4) next build [--build]  (5) unit suites (every web `test:*` script
// except e2e, discovered from package.json, + root scripts/test.ts)  (6) secret scan over tracked files.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(here, "..");
const ROOT = resolve(WEB, "..");
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const outIdx = args.indexOf("--out");
const OUT = outIdx >= 0 ? resolve(args[outIdx + 1]) : join(WEB, "proof", "pass-3", "gates.json");
const WANT_BUILD = flag("--build");
const node = process.execPath;

const results = [];
const startedAt = new Date();
const ts = () => new Date().toISOString();
const log = (s) => { if (!flag("--json-only")) process.stdout.write(s + "\n"); };

function tail(s, n = 40) {
  const lines = String(s || "").trimEnd().split("\n");
  return lines.slice(-n).join("\n");
}

/** Run a command; returns a result record and prints a header + output tail. */
function run(name, cmd, argv, { cwd, env, hard = true, timeoutMs = 20 * 60_000 } = {}) {
  const started = ts();
  log(`\n[${started}] ▶ ${name}\n  $ (cd ${relative(ROOT, cwd) || "."} && ${[cmd === node ? "node" : cmd, ...argv.map((a) => (a.startsWith("/") ? relative(cwd, a) : a))].join(" ")})`);
  const t0 = performance.now();
  const r = spawnSync(cmd, argv, { cwd, env: { ...process.env, ...env, FORCE_COLOR: "0" }, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs });
  const ms = Math.round(performance.now() - t0);
  const out = (r.stdout || "") + (r.stderr || "");
  let status = r.status === 0 ? "pass" : "fail";
  if (r.error) status = "fail";
  const rec = { name, status, hard, exitCode: r.status, signal: r.signal ?? null, error: r.error?.message ?? null, ms, startedAt: started, finishedAt: ts(), cwd: relative(ROOT, cwd) || ".", command: [cmd === node ? "node" : cmd, ...argv.map((a) => (a.startsWith("/") ? relative(cwd, a) : a))].join(" "), outputTail: tail(out) };
  results.push(rec);
  const shown = status === "pass" ? tail(out, 8) : tail(out, 60);
  if (shown.trim()) log(shown.split("\n").map((l) => "  │ " + l).join("\n"));
  log(`[${rec.finishedAt}] ${status === "pass" ? "✔" : "✘"} ${name} (${(ms / 1000).toFixed(1)}s, exit ${r.status ?? r.signal ?? r.error?.code})`);
  return rec;
}

function skip(name, reason, { hard = true } = {}) {
  const now = ts();
  const rec = { name, status: "skipped", hard, reason, ms: 0, startedAt: now, finishedAt: now };
  results.push(rec);
  log(`\n[${now}] ○ ${name} — skipped: ${reason}`);
  return rec;
}

/** Parse a dotenv file into an object (no interpolation; values never printed). */
function readDotenv(file) {
  if (!existsSync(file)) return {};
  const env = {};
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "");
    env[m[1]] = v;
  }
  return env;
}

// ───────────────────────── (1) root tsc ─────────────────────────
const rootTsc = join(ROOT, "node_modules/typescript/bin/tsc");
if (existsSync(rootTsc)) run("tsc:root", node, [rootTsc, "-p", "tsconfig.json", "--noEmit"], { cwd: ROOT });
else skip("tsc:root", "root node_modules/typescript missing");

// ───────────────────────── (2) web tsc ─────────────────────────
const webTsc = join(WEB, "node_modules/typescript/bin/tsc");
if (existsSync(webTsc)) run("tsc:web", node, [webTsc, "--noEmit"], { cwd: WEB });
else skip("tsc:web", "web/node_modules/typescript missing");

// ───────────────────────── (3) eslint ─────────────────────────
{
  const eslintBin = join(WEB, "node_modules/eslint/bin/eslint.js");
  const hasConfig = ["eslint.config.mjs", "eslint.config.js", "eslint.config.cjs", "eslint.config.ts"].some((f) => existsSync(join(WEB, f)));
  if (!existsSync(eslintBin)) skip("eslint", "eslint is not installed in web/node_modules (no eslint / eslint-config-next package; install forbidden in this pass)");
  else if (!hasConfig) skip("eslint", "no web/eslint.config.* (ESLint 9 flat config) present");
  else run("eslint", node, [eslintBin, "src", "--max-warnings=0"], { cwd: WEB });
}

// ───────────────────────── (4) next build (opt-in) ─────────────────────────
if (WANT_BUILD) {
  const nextBin = join(WEB, "node_modules/next/dist/bin/next");
  if (!existsSync(nextBin)) skip("next:build", "web/node_modules/next missing");
  else {
    const dotenv = readDotenv(join(WEB, ".env"));
    log(`\n  (exporting ${Object.keys(dotenv).length} vars from web/.env into the build env)`);
    run("next:build", node, [nextBin, "build"], { cwd: WEB, env: { ...dotenv, NEXT_TELEMETRY_DISABLED: "1" }, timeoutMs: 30 * 60_000 });
  }
} else skip("next:build", "pass --build to run (≈3 min on 1 CPU; the merge agent runs it once)", { hard: false });

// ───────────────────────── (5) unit suites ─────────────────────────
if (!flag("--no-unit")) {
  const pkg = JSON.parse(readFileSync(join(WEB, "package.json"), "utf8"));
  const unitScripts = Object.keys(pkg.scripts || {}).filter((k) => k.startsWith("test:") && !/e2e/.test(k) && !/playwright/.test(pkg.scripts[k]));
  if (unitScripts.length === 0) skip("unit:web", "no web test:* scripts (except e2e) in package.json");
  for (const s of unitScripts) {
    // Run the script line via sh (scripts are plain `node ... file` commands; no npm needed).
    run(`unit:${s.slice(5)}`, "sh", ["-c", pkg.scripts[s]], { cwd: WEB, env: { NODE_ENV: "test" } });
  }
  const tsx = join(ROOT, "node_modules/tsx/dist/cli.mjs");
  const rootTest = join(ROOT, "scripts/test.ts");
  if (existsSync(tsx) && existsSync(rootTest)) {
    const rec = run("unit:root", node, [tsx, "scripts/test.ts"], { cwd: ROOT });
    // scripts/test.ts prints "FAIL -" lines; be strict even if it exits 0.
    if (rec.status === "pass" && /^FAIL -/m.test(rec.outputTail)) { rec.status = "fail"; rec.error = "FAIL lines in output"; }
  } else skip("unit:root", "root node_modules/tsx or scripts/test.ts missing");
} else skip("unit", "--no-unit", { hard: false });

// ───────────────────────── (6) secret scan ─────────────────────────
if (!flag("--no-secrets")) {
  const started = ts();
  log(`\n[${started}] ▶ secrets`);
  const t0 = performance.now();
  const findings = [];
  const git = (argv) => spawnSync("git", argv, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  // 6a tracked .env files (examples allowed)
  const tracked = (git(["ls-files"]).stdout || "").split("\n").filter(Boolean);
  for (const f of tracked) {
    const base = f.split("/").pop();
    if (/^\.env(\..+)?$/.test(base) && !/\.example$/.test(base) && base !== ".env.example") findings.push({ rule: "tracked-dotenv", file: f });
  }
  // 6b token patterns over tracked text files (-I skips binaries)
  const tokenRules = [
    ["github-token", String.raw`\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b`],
    ["github-pat", String.raw`\bgithub_pat_[A-Za-z0-9_]{22,}\b`],
    ["vercel-token", String.raw`\bvcp_[A-Za-z0-9]{20,}\b`],
    ["openai-anthropic-key", String.raw`\bsk-(proj-|ant-)?[A-Za-z0-9_-]{32,}\b`],
    ["aws-access-key", String.raw`\bAKIA[0-9A-Z]{16}\b`],
    ["ingest-secret-64hex", String.raw`INGEST_SECRET=[0-9a-fA-F]{64}`],
  ];
  for (const [rule, re] of tokenRules) {
    const r = git(["grep", "-nIE", re, "--", ".", ":(exclude)**/package-lock.json"]);
    for (const line of (r.stdout || "").split("\n").filter(Boolean)) {
      const [file, lineNo] = line.split(":");
      findings.push({ rule, file, line: Number(lineNo) });
    }
  }
  // 6c Azure SAS signatures in source
  {
    const r = git(["grep", "-nIE", String.raw`[?&]sig=[A-Za-z0-9%+/=]{20,}`, "--", "src", "web/src", "scripts", "web/scripts"]);
    for (const line of (r.stdout || "").split("\n").filter(Boolean)) {
      const [file, lineNo] = line.split(":");
      findings.push({ rule: "sas-sig", file, line: Number(lineNo) });
    }
  }
  const ms = Math.round(performance.now() - t0);
  const rec = { name: "secrets", status: findings.length ? "fail" : "pass", hard: true, ms, startedAt: started, finishedAt: ts(), findings, rules: ["tracked-dotenv", ...tokenRules.map((r) => r[0]), "sas-sig"] };
  results.push(rec);
  for (const f of findings) log(`  │ ${f.rule}: ${f.file}${f.line ? ":" + f.line : ""}`);
  log(`[${rec.finishedAt}] ${rec.status === "pass" ? "✔" : "✘"} secrets (${findings.length} finding(s), ${ms}ms)`);
} else skip("secrets", "--no-secrets", { hard: false });

// ───────────────────────── report ─────────────────────────
const hardFails = results.filter((r) => r.hard && r.status === "fail");
const head = (() => { const r = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }); return (r.stdout || "").trim() || null; })();
const branch = (() => { const r = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: ROOT, encoding: "utf8" }); return (r.stdout || "").trim() || null; })();
const report = {
  schema: "gates/v1",
  startedAt: startedAt.toISOString(),
  finishedAt: ts(),
  totalMs: Date.now() - startedAt.getTime(),
  node: process.version,
  git: { head, branch },
  flags: { build: WANT_BUILD, unit: !flag("--no-unit"), secrets: !flag("--no-secrets") },
  ok: hardFails.length === 0,
  summary: { pass: results.filter((r) => r.status === "pass").length, fail: results.filter((r) => r.status === "fail").length, skipped: results.filter((r) => r.status === "skipped").length },
  gates: results,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");

const pad = (s, n) => String(s).padEnd(n);
const rows = results.map((r) => [r.name, r.status.toUpperCase(), r.hard ? "hard" : "soft", `${(r.ms / 1000).toFixed(1)}s`, r.status === "skipped" ? r.reason : r.status === "fail" ? (r.error || `exit ${r.exitCode ?? r.signal}`) + (r.findings ? ` — ${r.findings.length} finding(s)` : "") : ""]);
const w = [0, 1, 2, 3].map((i) => Math.max(...rows.map((r) => r[i].length), ["gate", "status", "kind", "time"][i].length));
log("\n" + ["gate", "status", "kind", "time", "note"].map((h, i) => pad(h, w[i] ?? 0)).join("  "));
log(w.map((n) => "─".repeat(n)).join("  ") + "  ────");
for (const r of rows) log(r.map((c, i) => (i < 4 ? pad(c, w[i]) : c)).join("  "));
log(`\n${report.ok ? "GATES OK" : "GATES FAILED"} — ${report.summary.pass} pass / ${report.summary.fail} fail / ${report.summary.skipped} skipped in ${(report.totalMs / 1000).toFixed(1)}s → ${relative(ROOT, OUT)}`);
if (flag("--json-only")) process.stdout.write(JSON.stringify(report) + "\n");
process.exit(report.ok ? 0 : 1);
