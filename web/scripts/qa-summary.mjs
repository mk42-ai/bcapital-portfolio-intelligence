#!/usr/bin/env node
// Lane G — merges sse-summary.json, console-errors.json, brand-audit.json, smoothness.json, qa-log.ndjson and the screenshot list
// into web/proof/qa-final/<label>/summary.json + summary.md.   Usage: cd web && QA_LABEL=final node scripts/qa-summary.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = process.env.QA_LABEL ?? "baseline";
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "proof", "qa-final", LABEL);
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8")); } catch { return null; } };
const sse = readJson("sse-summary.json"), errors = readJson("console-errors.json"), brand = readJson("brand-audit.json"), smooth = readJson("smoothness.json");
const logLines = fs.existsSync(path.join(OUT, "qa-log.ndjson")) ? fs.readFileSync(path.join(OUT, "qa-log.ndjson"), "utf8").trim().split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : [];
const screenshots = fs.existsSync(OUT) ? fs.readdirSync(OUT).filter((f) => f.endsWith(".png")).sort() : [];
const na = logLines.filter((l) => l.action === "screenshot-na").map((l) => ({ state: l.state, viewport: l.viewport, reason: l.reason }));
const captured = logLines.filter((l) => l.action === "screenshot").map((l) => ({ state: l.state, viewport: l.viewport, file: l.file }));
const rec = (r) => (r ? { firstEventMs: r.firstEventMs, firstTokenMs: r.firstTokenMs, totalMs: r.totalMs, doneSeen: r.doneSeen, heartbeats: r.heartbeats, frames: r.frames, counts: r.counts, custom: r.customCounts, error: r.error, artifact: r.artifact ? { chain: r.artifact.chain, readyBeforeDone: r.artifact.readyBeforeDone, readyBeforeRunFinished: r.artifact.readyBeforeRunFinished, name: r.artifact.artifactName, mediaStatus: r.artifact.mediaStatus } : null } : null);
const vpKeys = smooth ? Object.keys(smooth).filter((k) => k !== "overall" && k !== "formula") : [];
const summary = {
  label: LABEL, generatedUtc: new Date().toISOString(), baseUrl: sse?.baseUrl ?? process.env.BASE_URL ?? null, apiUrl: sse?.apiUrl ?? process.env.API_URL ?? null,
  sse: sse ? { report: rec(sse.report), news: rec(sse.news), artifacts: sse.artifacts, checks: sse.checks } : "missing (run scripts/record-sse.mjs)",
  consoleErrors: errors ?? "missing (run e2e/qa-final.spec.ts)",
  brand: brand ? { total_hits: brand.total_hits, by_route: Object.fromEntries(Object.entries(brand.by_route).map(([k, v]) => [k, v.hits])), by_prop: brand.by_prop, samples: brand.samples.slice(0, 10) } : "missing (run scripts/brand-audit.mjs)",
  smoothness: smooth ? { formula: smooth.formula, overall: smooth.overall, ...Object.fromEntries(vpKeys.map((k) => [k, { overall: smooth[k].overall, turn1: smooth[k].turn1 ? { score: smooth[k].turn1.score, firstSkeletonMs: smooth[k].turn1.firstSkeletonMs, firstTokenMs: smooth[k].turn1.firstTokenMs, totalMs: smooth[k].turn1.totalMs, streamCls: smooth[k].turn1.streamCls, longTasks: smooth[k].turn1.longTasks, orderOk: smooth[k].turn1.orderOk, artifactOk: smooth[k].turn1.artifactOk } : null, turn2: smooth[k].turn2 ? { score: smooth[k].turn2.score, firstSkeletonMs: smooth[k].turn2.firstSkeletonMs, firstTokenMs: smooth[k].turn2.firstTokenMs, totalMs: smooth[k].turn2.totalMs, streamCls: smooth[k].turn2.streamCls, longTasks: smooth[k].turn2.longTasks, orderOk: smooth[k].turn2.orderOk } : null, errors: smooth[k].errors }])) } : "missing (run e2e/qa-final.spec.ts)",
  screenshots: { count: screenshots.length, files: screenshots, captured, notAvailable: na },
};
fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
const ms = (v) => (v == null ? "n/a" : `${v} ms`);
const md = [];
md.push(`# QA final — ${LABEL}`, "", `Generated ${summary.generatedUtc} · frontend ${summary.baseUrl ?? "?"} · backend ${summary.apiUrl ?? "?"}`, "");
md.push("## SSE recordings (scripts/record-sse.mjs)", "", "| run | first event | first token | total | [DONE] | heartbeats | frames | artifact chain |", "|---|---|---|---|---|---|---|---|");
for (const k of ["report", "news"]) { const r = sse?.[k]; md.push(r ? `| ${k} | ${ms(r.firstEventMs)} | ${ms(r.firstTokenMs)} | ${ms(r.totalMs)} | ${r.doneSeen ? "yes" : "NO"} | ${r.heartbeats} | ${r.frames} | ${r.artifact?.chain ?? "—"} (ready before [DONE]: ${r.artifact?.readyBeforeDone ? "yes" : "no"}) |` : `| ${k} | missing |`); }
if (sse?.artifacts) md.push("", `Artifact list: ${sse.artifacts.listed ? `listed (${sse.artifacts.artifact?.name}, ${sse.artifacts.contentBytes} B, media ${sse.artifacts.artifact?.mediaStatus})` : "NOT listed"} · content HTTP ${sse.artifacts.contentStatus} %PDF=${sse.artifacts.pdfMagic} · signed-url: ${sse.checks?.signedUrl}`);
md.push("", "## Console / page errors per route (real = after allow-list: favicon, ERR_ABORTED, ORB, 404 resources)", "");
if (errors) for (const [vp, routes] of Object.entries(errors)) { if (vp === "totals") continue; md.push(`- **${vp}**: ` + (typeof routes === "object" && routes && !("real" in routes) ? Object.entries(routes).map(([r, v]) => `${r}=${v.real}${v.real ? ` (${v.samples[0]?.slice(0, 90)})` : ""}`).join(", ") : `real=${routes.real}${routes.samples?.[0] ? ` (${routes.samples[0].slice(0, 90)})` : ""}`)); }
md.push("", "## Brand audit (no blue hues)", "", brand ? `**Total hits: ${brand.total_hits}** — ${Object.entries(brand.by_route).map(([k, v]) => `${k}: ${v.hits}`).join(" · ")}` : "missing");
if (brand?.samples?.length) md.push("", ...brand.samples.slice(0, 8).map((s) => `- ${s.route} @${s.viewport}: \`${s.selector}\` ${s.prop}: ${s.value}`));
md.push("", "## Smoothness (run-ux score /10)", "", smooth ? `Formula: ${smooth.formula}` : "missing", "");
if (smooth) { for (const k of vpKeys) { const v = smooth[k]; md.push(`- **${k}**: overall ${v.overall} — turn1 ${v.turn1?.score?.total ?? "n/a"} (${JSON.stringify(v.turn1?.score?.parts ?? {})}, first token ${ms(v.turn1?.firstTokenMs)}, CLS ${v.turn1?.streamCls}, long tasks ${v.turn1?.longTasks}) · turn2 ${v.turn2?.score?.total ?? "n/a"} (${JSON.stringify(v.turn2?.score?.parts ?? {})}, first token ${ms(v.turn2?.firstTokenMs)}, CLS ${v.turn2?.streamCls}, long tasks ${v.turn2?.longTasks})`); } md.push(`- **overall**: ${smooth.overall}`); }
md.push("", `## Screenshots (${screenshots.length})`, "", ...screenshots.map((f) => `- ${f}`));
if (na.length) md.push("", "### Not available", "", ...na.map((n) => `- ${n.state} @${n.viewport}: ${n.reason}`));
fs.writeFileSync(path.join(OUT, "summary.md"), md.join("\n") + "\n");
console.log(md.join("\n"));
