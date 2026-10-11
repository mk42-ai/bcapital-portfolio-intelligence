#!/usr/bin/env node
// a48 — aggregates web/proof/pass-3/axe/<label>/*.json (written by e2e/axe-sweep.spec.ts) into summary.md + summary.json:
// route × viewport → counts by impact, top rule ids, top offenders (rule + first selector) for component owners.
//   cd web && AXE_LABEL=before node scripts/axe-summary.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = process.env.AXE_LABEL ?? process.argv[2] ?? "before";
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "proof", "pass-3", "axe", LABEL);
if (!fs.existsSync(OUT)) {
  console.error(`no axe output at ${OUT} — run e2e/axe-sweep.spec.ts with AXE_LABEL=${LABEL} first`);
  process.exit(1);
}
const files = fs.readdirSync(OUT).filter((f) => f.endsWith(".json") && f !== "summary.json").sort();
const reports = files.map((f) => ({ file: f, ...JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8")) }));
const IMPACTS = ["critical", "serious", "moderate", "minor"];

const rows = reports.map((r) => ({
  route: r.state === "after-turn" ? `${r.route} (after turn)` : r.route,
  viewport: r.viewport,
  ...Object.fromEntries(IMPACTS.map((i) => [i, r.counts[i] ?? 0])),
  total: r.counts.total ?? 0,
  rules: r.violations.map((v) => v.id),
  fail: !!r.fail,
}));

// rule aggregation
const byRule = new Map();
for (const r of reports)
  for (const v of r.violations) {
    const e = byRule.get(v.id) ?? { id: v.id, impact: v.impact, pages: 0, nodes: 0, helpUrl: v.helpUrl, help: v.help, targets: new Map() };
    e.pages += 1;
    e.nodes += v.nodes;
    const key = v.firstTarget;
    const t = e.targets.get(key) ?? { target: key, where: [] };
    t.where.push(`${r.route}${r.state === "after-turn" ? " (after turn)" : ""}@${r.viewport}`);
    e.targets.set(key, t);
    byRule.set(v.id, e);
  }
const rank = (i) => IMPACTS.indexOf(i ?? "minor");
const rules = [...byRule.values()]
  .map((e) => ({ ...e, targets: [...e.targets.values()] }))
  .sort((a, b) => rank(a.impact) - rank(b.impact) || b.nodes - a.nodes || b.pages - a.pages);

const totals = Object.fromEntries(IMPACTS.map((i) => [i, rows.reduce((s, r) => s + r[i], 0)]));
const summary = {
  label: LABEL,
  generatedUtc: new Date().toISOString(),
  baseUrl: reports[0]?.url ? new URL(reports[0].url).origin : null,
  tags: reports[0]?.tags ?? [],
  audits: rows.length,
  failing: rows.filter((r) => r.fail).length,
  totals,
  matrix: rows,
  rules: rules.map((e) => ({ id: e.id, impact: e.impact, pages: e.pages, nodes: e.nodes, helpUrl: e.helpUrl, help: e.help, targets: e.targets.slice(0, 5) })),
};
fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 2));

const md = [];
md.push(`# axe a11y sweep — ${LABEL}`, "");
md.push(`Generated ${summary.generatedUtc} · target ${summary.baseUrl ?? "?"} · tags \`${summary.tags.join(", ")}\``);
md.push(`${summary.audits} audits · **${summary.failing} failing** (serious/critical) · totals: ${IMPACTS.map((i) => `${i} ${totals[i]}`).join(" · ")}`, "");
md.push("## Route × viewport", "", "| route | viewport | critical | serious | moderate | minor | total | status | rule ids |", "|---|---|---|---|---|---|---|---|---|");
for (const r of rows)
  md.push(`| ${r.route} | ${r.viewport} | ${r.critical} | ${r.serious} | ${r.moderate} | ${r.minor} | ${r.total} | ${r.fail ? "❌ FAIL" : r.total ? "⚠️ report" : "✅"} | ${r.rules.join(", ") || "—"} |`);
md.push("", "## Top rule ids (by impact, then node count)", "", "| rule | impact | audits | nodes | help |", "|---|---|---|---|---|");
for (const e of rules) md.push(`| \`${e.id}\` | ${e.impact ?? "n/a"} | ${e.pages} | ${e.nodes} | [${e.help}](${e.helpUrl}) |`);
md.push("", "## Top offenders (rule → first target selector → where)", "");
for (const e of rules) {
  md.push(`- **\`${e.id}\`** (${e.impact ?? "n/a"})`);
  for (const t of e.targets.slice(0, 5)) md.push(`  - \`${t.target}\` — ${t.where.join(", ")}`);
}
md.push("");
fs.writeFileSync(path.join(OUT, "summary.md"), md.join("\n"));
console.log(md.join("\n"));
