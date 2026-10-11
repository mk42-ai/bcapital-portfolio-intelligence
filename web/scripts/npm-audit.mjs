#!/usr/bin/env node
// a43 — npm audit runner with an OFFLINE fallback.
// Runs `npm audit --json --omit=dev` and `npm audit --json` in web/ and the repo root (never installs anything).
// If npm audit fails with a network/registry error (EALLOWREMOTE, ENOTFOUND, ECONNREFUSED, ETIMEDOUT, 403/5xx …)
// it falls back to a heuristic check: parse package-lock.json and compare the top deps against a small built-in
// list of known-vulnerable ranges, and states plainly "npm audit unavailable offline; heuristic check only".
// Usage: cd web && node scripts/npm-audit.mjs   → web/proof/pass-3/security/{npm-audit-web.json,npm-audit-root.json,summary.md}
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(here, "..");
const ROOT = path.resolve(WEB, "..");
const OUT_DIR = path.join(WEB, "proof", "pass-3", "security");
fs.mkdirSync(OUT_DIR, { recursive: true });

const SEVERITIES = ["critical", "high", "moderate", "low", "info"];
const NETWORK_RE = /EALLOWREMOTE|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|EPROTO|ERR_SOCKET|registry|network|fetch failed|audit endpoint returned|E403|E429|E5\d\d|offline|getaddrinfo/i;

// ---- offline heuristic knowledge base (semver ranges are checked with a tiny comparator below; no deps)
// Each entry: { name, vulnerableBelow | vulnerableRanges:[{gte,lt}], id, note }
const KNOWN = [
  { name: "pdfjs-dist", ranges: [{ lt: "4.2.67" }], id: "CVE-2024-4367", severity: "high", note: "arbitrary JS execution via malicious PDF font (fixed 4.2.67); 4.10.38 is fine" },
  { name: "next", ranges: [{ lt: "14.2.25" }, { gte: "15.0.0", lt: "15.2.3" }], id: "CVE-2025-29927", severity: "critical", note: "middleware auth bypass via x-middleware-subrequest (fixed 14.2.25 / 15.2.3)" },
  { name: "next", ranges: [{ gte: "13.0.0", lt: "14.2.10" }], id: "CVE-2024-46982", severity: "high", note: "cache poisoning of SSR pages (fixed 14.2.10)" },
  { name: "next", ranges: [{ gte: "15.0.0", lt: "15.1.2" }, { lt: "14.2.21" }], id: "CVE-2024-56332", severity: "moderate", note: "DoS via Server Actions (fixed 14.2.21 / 15.1.2)" },
  { name: "react", ranges: [{ lt: "16.0.0" }], id: "advisory-react-<16", severity: "moderate", note: "legacy XSS vectors in very old React; anything 18/19 is fine" },
  { name: "react-dom", ranges: [{ gte: "16.0.0", lt: "16.0.1" }], id: "CVE-2018-6341", severity: "moderate", note: "server-side XSS in renderToString (16.0.0 only)" },
  { name: "drizzle-orm", ranges: [], id: "-", severity: "none", note: "no published CVEs for drizzle-orm at time of writing" },
  { name: "hono", ranges: [{ lt: "4.6.5" }], id: "CVE-2024-43787", severity: "moderate", note: "CSRF middleware bypass with Content-Type casing (fixed 4.6.5)" },
  { name: "hono", ranges: [{ gte: "4.0.0", lt: "4.2.7" }], id: "CVE-2024-32652", severity: "moderate", note: "serveStatic path traversal on Deno (fixed 4.2.7)" },
  { name: "sql.js", ranges: [], id: "-", severity: "none", note: "no published CVEs for sql.js (wasm SQLite; SQLite CVEs tracked upstream)" },
  { name: "@hono/node-server", ranges: [{ lt: "1.10.1" }], id: "GHSA-ffh5-f8g7-xx7m", severity: "moderate", note: "serveStatic directory traversal (fixed 1.10.1)" },
];
const TOP_DEPS = ["next", "react", "react-dom", "drizzle-orm", "hono", "sql.js", "pdfjs-dist", "@hono/node-server", "lucide-react", "typescript"];

function parseVer(v) {
  const m = String(v).match(/^(\d+)\.(\d+)\.(\d+)/);
  return m ? [+m[1], +m[2], +m[3]] : null;
}
function cmp(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}
function inRange(v, r) {
  const pv = parseVer(v);
  if (!pv) return false;
  if (r.gte && cmp(pv, parseVer(r.gte)) < 0) return false;
  if (r.lt && cmp(pv, parseVer(r.lt)) >= 0) return false;
  return true;
}

function runAudit(cwd, omitDev) {
  const args = ["audit", "--json"];
  if (omitDev) args.push("--omit=dev");
  const res = spawnSync("npm", args, { cwd, encoding: "utf8", timeout: 120_000, env: { ...process.env, NO_COLOR: "1" } });
  const stdout = res.stdout || "";
  const stderr = res.stderr || "";
  let json = null;
  try { json = JSON.parse(stdout); } catch { json = null; }
  // npm exits 1 when vulns are found but still prints the JSON report — that is a successful run.
  if (json && json.auditReportVersion) {
    const counts = json.metadata?.vulnerabilities ?? {};
    const vulns = Object.entries(json.vulnerabilities ?? {}).map(([name, v]) => ({
      name, severity: v.severity, range: v.range, fixAvailable: !!v.fixAvailable, direct: !!v.isDirect,
      via: (v.via || []).map((x) => (typeof x === "string" ? x : `${x.title} (${x.url})`)).slice(0, 5),
    }));
    return { ok: true, mode: "npm-audit", omitDev, exitCode: res.status, counts, vulnerabilities: vulns, totalDeps: json.metadata?.dependencies?.total ?? null };
  }
  // failure: npm prints an {error:{code,summary,detail}} JSON or plain text
  const fromJson = json ? [json.message, json.error?.code, json.error?.summary, json.error?.detail].filter(Boolean).join(" ") : "";
  const fromStderr = stderr.split("\n").filter((l) => /npm (warn|error)|error|failed/i.test(l) && !/complete log of this run/.test(l)).join("\n");
  const errText = [fromJson, fromStderr].filter(Boolean).join("\n").trim() || stdout.trim();
  const networkish = NETWORK_RE.test(errText) || !!res.error;
  return { ok: false, mode: "npm-audit", omitDev, exitCode: res.status, error: (res.error ? `${res.error.code}: ${res.error.message}\n` : "") + errText.slice(0, 2000), networkish };
}

function offlineCheck(cwd) {
  const lockPath = path.join(cwd, "package-lock.json");
  if (!fs.existsSync(lockPath)) return { ok: false, mode: "offline-heuristic", error: `no package-lock.json in ${cwd}` };
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  const pkgs = lock.packages ?? {};
  const installed = {};
  for (const [k, v] of Object.entries(pkgs)) {
    if (!k.startsWith("node_modules/")) continue;
    const name = k.replace(/^.*node_modules\//, "");
    if (!installed[name]) installed[name] = new Set();
    if (v.version) installed[name].add(v.version);
  }
  const checked = [];
  const hits = [];
  for (const dep of TOP_DEPS) {
    const versions = [...(installed[dep] ?? [])];
    if (!versions.length) continue;
    const rules = KNOWN.filter((k) => k.name === dep);
    checked.push({ name: dep, versions, rules: rules.map((r) => r.id).filter((id) => id !== "-") });
    for (const v of versions) for (const r of rules) if (r.ranges.some((rg) => inRange(v, rg))) hits.push({ name: dep, version: v, id: r.id, severity: r.severity, note: r.note });
  }
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, hits.filter((h) => h.severity === s).length]));
  counts.total = hits.length;
  return {
    ok: true, mode: "offline-heuristic", lockfileVersion: lock.lockfileVersion, packagesInLock: Object.keys(pkgs).length,
    statement: "npm audit unavailable offline; heuristic check only",
    checked, counts, vulnerabilities: hits, knowledgeBase: KNOWN.map(({ name, id, severity }) => ({ name, id, severity })),
  };
}

function auditTarget(label, cwd) {
  const prod = runAudit(cwd, true);
  const full = runAudit(cwd, false);
  const result = { target: label, cwd: path.relative(ROOT, cwd) || ".", generated_utc: new Date().toISOString(), prod, full };
  if (!prod.ok || !full.ok) {
    result.fallback = offlineCheck(cwd);
    result.status = "npm audit unavailable offline; heuristic check only";
  } else {
    result.status = "npm audit ran online";
  }
  return result;
}

const web = auditTarget("web", WEB);
const root = auditTarget("root", ROOT);
fs.writeFileSync(path.join(OUT_DIR, "npm-audit-web.json"), JSON.stringify(web, null, 2) + "\n");
fs.writeFileSync(path.join(OUT_DIR, "npm-audit-root.json"), JSON.stringify(root, null, 2) + "\n");

// ---- summary.md (also folds in secret-scan.json when present)
const secretPath = path.join(OUT_DIR, "secret-scan.json");
const secret = fs.existsSync(secretPath) ? JSON.parse(fs.readFileSync(secretPath, "utf8")) : null;

function sevTable(counts) {
  const c = counts ?? {};
  return `| critical | high | moderate | low | info | total |\n|---|---|---|---|---|---|\n| ${c.critical ?? 0} | ${c.high ?? 0} | ${c.moderate ?? 0} | ${c.low ?? 0} | ${c.info ?? 0} | ${c.total ?? 0} |`;
}
function section(r) {
  const lines = [`## npm audit — ${r.target} (\`${r.cwd}\`)`, "", `Status: **${r.status}**`, ""];
  for (const key of ["prod", "full"]) {
    const a = r[key];
    const title = key === "prod" ? "`npm audit --json --omit=dev`" : "`npm audit --json`";
    lines.push(`### ${title}`);
    if (a.ok) {
      lines.push("", `exit code ${a.exitCode}, ${a.totalDeps ?? "?"} deps audited`, "", sevTable(a.counts));
      if (a.vulnerabilities.length) {
        lines.push("", "| package | severity | range | direct | fix available | via |", "|---|---|---|---|---|---|");
        for (const v of a.vulnerabilities) lines.push(`| ${v.name} | ${v.severity} | ${v.range} | ${v.direct} | ${v.fixAvailable} | ${v.via.join("; ").replace(/\|/g, "\\|")} |`);
      }
    } else {
      lines.push("", `**npm audit could not run** (exit ${a.exitCode}, network/registry error: ${a.networkish}). Exact error text:`, "", "```", a.error || "(no output)", "```");
    }
    lines.push("");
  }
  if (r.fallback) {
    const f = r.fallback;
    lines.push("### Offline fallback (package-lock.json heuristic)", "", `> ${f.statement ?? f.error}`, "");
    if (f.ok) {
      lines.push(`lockfile v${f.lockfileVersion}, ${f.packagesInLock} package entries; top deps checked: ${f.checked.map((c) => `${c.name}@${c.versions.join("/")}`).join(", ")}`, "", sevTable(f.counts));
      if (f.vulnerabilities.length) {
        lines.push("", "| package | version | advisory | severity | note |", "|---|---|---|---|---|");
        for (const h of f.vulnerabilities) lines.push(`| ${h.name} | ${h.version} | ${h.id} | ${h.severity} | ${h.note} |`);
      } else lines.push("", "No top-dependency version falls inside a known-vulnerable range in the built-in list (heuristic, NOT a full audit).");
    }
    lines.push("");
  }
  return lines.join("\n");
}

const md = [
  "# Pass-3 security report (a43)",
  "",
  `Generated ${new Date().toISOString()} · node ${process.version} · npm ${spawnSync("npm", ["-v"], { encoding: "utf8" }).stdout?.trim() ?? "?"}`,
  "",
  "## Secret scan (`scripts/secret-scan.sh`, git-tracked files only)",
  "",
  secret
    ? [
        `Scanned **${secret.scanned_files}** tracked files @ ${secret.commit}: **${secret.findings_count} finding(s)**, ${secret.info_count} info item(s).`,
        "",
        "Checks: tracked `.env*` (non-example) · `$ON_DEMAND_API_KEY` value · GitHub/Vercel/OpenAI/AWS token patterns · `INGEST_SECRET=<64 hex>` · Azure SAS `sig=` in code dirs (docs/proof → info) · private keys · JWT-looking strings in code dirs (docs/proof → info).",
        "",
        secret.findings.length ? ["| rule | file | line | excerpt |", "|---|---|---|---|", ...secret.findings.map((f) => `| ${f.rule} | ${f.file} | ${f.line} | ${f.excerpt} |`)].join("\n") : "No findings.",
        "",
        "Info items by rule/file (signed URLs in proof/docs/manifests, not source):",
        "",
        ...Object.entries(secret.info.reduce((acc, i) => ((acc[`${i.rule} · ${i.file}`] = (acc[`${i.rule} · ${i.file}`] ?? 0) + 1), acc), {})).map(([k, n]) => `- ${k}: ${n}`),
      ].join("\n")
    : "_secret-scan.json not present — run `scripts/secret-scan.sh --out web/proof/pass-3/security/secret-scan.json` first._",
  "",
  section(web),
  section(root),
  "## How to re-run",
  "",
  "```",
  "scripts/secret-scan.sh --out web/proof/pass-3/security/secret-scan.json   # exit 1 on findings",
  "cd web && node scripts/npm-audit.mjs                                      # writes npm-audit-*.json + summary.md",
  "```",
  "",
].join("\n");
fs.writeFileSync(path.join(OUT_DIR, "summary.md"), md);

const line = (r) => `${r.target}: ${r.status}` + (r.full.ok ? ` — full total=${r.full.counts.total} prod total=${r.prod.counts.total}` : ` — fallback total=${r.fallback?.counts?.total ?? "n/a"}`);
console.log(line(web));
console.log(line(root));
console.log(`wrote ${path.relative(ROOT, OUT_DIR)}/{npm-audit-web.json,npm-audit-root.json,summary.md}`);
