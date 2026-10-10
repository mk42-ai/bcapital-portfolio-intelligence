#!/usr/bin/env node
// compare.mjs <beforeLabel> <afterLabel>  (default: before after)
// Reads docs/proof/<label>/{timeline.json,score.json} (self-contained — does not need web/artifacts) and writes
//   docs/proof/compare.md          metric | before | after | delta table per viewport/turn + top-3 findings
//   docs/proof/compare.json        the same numbers, machine-readable
// If web/artifacts/timeline-<label>-<vp>.json still exist for both labels, the legacy artifacts/timeline-comparison.json is also written.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, "..", ".."); const ART = path.join(WEB, "artifacts"); const PROOF = path.resolve(WEB, "..", "docs", "proof");
const [BL = "before", AL = "after"] = process.argv.slice(2);
const read = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null);
const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);
const fmt = (v) => (v == null ? "—" : typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(v < 1 ? 4 : 1)) : typeof v === "boolean" ? (v ? "yes" : "no") : String(v));
const delta = (b, a, lowerIsBetter) => { if (num(b) == null || num(a) == null) return { d: null, s: "—" }; const d = +(a - b).toFixed(4); const good = d === 0 ? "=" : (d < 0) === !!lowerIsBetter ? "✅" : "⚠️"; return { d, s: `${d > 0 ? "+" : ""}${Number.isInteger(d) ? d : d.toFixed(d < 1 && d > -1 ? 4 : 1)} ${good}` }; };

const B = { tl: read(path.join(PROOF, BL, "timeline.json")), sc: read(path.join(PROOF, BL, "score.json")) };
const A = { tl: read(path.join(PROOF, AL, "timeline.json")), sc: read(path.join(PROOF, AL, "score.json")) };
if (!B.tl || !A.tl) { console.error(`compare: need docs/proof/${BL}/timeline.json and docs/proof/${AL}/timeline.json`); process.exit(1); }

// metric name → [accessor on compact turn, lowerIsBetter]
const METRICS = [
  ["first_event_ms", "first SSE event (ms)", true], ["first_token_ms", "first answer token (ms)", true], ["first_citation_ms", "first citation chip (ms)", true],
  ["answer_done_ms", "answer done (ms)", true], ["total_ms", "total turn (ms)", true], ["frame_count", "SSE frames", false],
  ["dead_air_gaps", "dead-air gaps >800 ms", true], ["max_gap_ms", "max gap (ms)", true], ["cls", "CLS", true], ["cls_shifts", "layout shifts", true],
  ["long_tasks", "long tasks >50 ms", true], ["long_task_max_ms", "longest task (ms)", true], ["long_task_total_ms", "long-task total (ms)", true],
  ["console_errors", "console errors", true], ["page_errors", "page errors", true], ["failed_requests", "failed requests", true],
];
const lines = [`# UX before/after comparison`, ``, `Generated ${new Date().toISOString()} by \`web/tests/e2e/compare.mjs ${BL} ${AL}\`.`, ``,
  `| run | base URL | recorded (UTC) | smoothness score (0–10) |`, `|---|---|---|---|`,
  `| ${BL} | ${B.tl.base_url ?? "—"} | ${B.tl.generated_utc ?? "—"} | ${fmt(B.sc?.overall)} |`, `| ${AL} | ${A.tl.base_url ?? "—"} | ${A.tl.generated_utc ?? "—"} | ${fmt(A.sc?.overall)} |`, ``];
const out = { generated_utc: new Date().toISOString(), before: BL, after: AL, smoothness: { before: B.sc?.overall ?? null, after: A.sc?.overall ?? null, delta: delta(B.sc?.overall, A.sc?.overall, false).d }, viewports: {} };
const findings = []; // {weight, text}
const push = (weight, text) => findings.push({ weight, text });
for (const vp of ["desktop", "mobile"]) {
  const bv = B.tl.viewports?.[vp], av = A.tl.viewports?.[vp];
  if (!bv && !av) continue;
  out.viewports[vp] = { turns: {} };
  lines.push(`## ${vp}`, ``);
  const sb = B.sc?.viewports?.[vp], sa = A.sc?.viewports?.[vp];
  if (sb || sa) { const d = delta(sb?.overall, sa?.overall, false); lines.push(`Score: ${fmt(sb?.overall)} → ${fmt(sa?.overall)} (${d.s}). GROWTH grid: ${fmt(sb?.growth?.pass)} → ${fmt(sa?.growth?.pass)}.`, ``); out.viewports[vp].score = { before: sb?.overall ?? null, after: sa?.overall ?? null, delta: d.d }; if (d.d != null && d.d !== 0) push(Math.abs(d.d) * 3, `${vp}: smoothness score ${fmt(sb?.overall)} → ${fmt(sa?.overall)} (${d.s}).`); if (sb?.growth?.pass !== sa?.growth?.pass) push(5, `${vp}: GROWTH grid assertions ${fmt(sb?.growth?.pass)} → ${fmt(sa?.growth?.pass)}${sa?.growth?.failed_assertions?.length ? ` (failing: ${sa.growth.failed_assertions.slice(0, 3).join("; ")})` : ""}.`); }
  const nTurns = Math.max(bv?.turns?.length ?? 0, av?.turns?.length ?? 0);
  for (let i = 0; i < nTurns; i++) {
    const tb = bv?.turns?.[i], ta = av?.turns?.[i]; const turn = (tb ?? ta).turn;
    lines.push(`### turn ${turn} — ${(ta ?? tb).prompt}`, ``, `outcome: ${BL} = \`${tb?.done_frame_type ?? "no terminal frame"}\` (perplexity ${tb?.perplexity?.status ?? "—"}${tb?.perplexity?.error_card_shown ? ", error card shown" : ""}) · ${AL} = \`${ta?.done_frame_type ?? "no terminal frame"}\` (perplexity ${ta?.perplexity?.status ?? "—"}${ta?.perplexity?.error_card_shown ? ", error card shown" : ""})`, ``,
      `| metric | ${BL} | ${AL} | delta |`, `|---|---:|---:|---:|`);
    const row = {};
    for (const [key, label, lower] of METRICS) { const b = tb?.[key] ?? null, a = ta?.[key] ?? null; const d = delta(b, a, lower); row[key] = { before: b, after: a, delta: d.d }; lines.push(`| ${label} | ${fmt(b)} | ${fmt(a)} | ${d.s} |`); }
    lines.push(``);
    out.viewports[vp].turns[`turn${turn}`] = row;
    // findings: weighted by relative size of change on the headline metrics
    const F = (key, label, lower, unit = "ms") => { const b = num(tb?.[key]), a = num(ta?.[key]); if (b == null || a == null || b === a) return; const rel = Math.abs(a - b) / Math.max(Math.abs(b), 1); const good = (a < b) === lower; push(rel * (key === "cls" ? 20 : 2) + (good ? 0 : 1), `${vp} turn ${turn}: ${label} ${fmt(b)}${unit} → ${fmt(a)}${unit} (${good ? "better" : "worse"}, ${(rel * 100).toFixed(0)}%).`); };
    F("first_token_ms", "first answer token", true); F("answer_done_ms", "answer done", true); F("first_event_ms", "first SSE event", true); F("cls", "CLS", true, ""); F("dead_air_gaps", "dead-air gaps", true, ""); F("long_tasks", "long tasks", true, ""); F("console_errors", "console errors", true, ""); F("failed_requests", "failed requests", true, "");
    if ((tb?.done_frame_type ?? null) !== (ta?.done_frame_type ?? null)) push(4, `${vp} turn ${turn}: terminal frame changed \`${tb?.done_frame_type ?? "none"}\` → \`${ta?.done_frame_type ?? "none"}\`.`);
    if ((tb?.perplexity?.status ?? null) !== (ta?.perplexity?.status ?? null)) push(4, `${vp} turn ${turn}: Perplexity plugin status ${tb?.perplexity?.status ?? "—"} → ${ta?.perplexity?.status ?? "—"}.`);
  }
}
findings.sort((a, b) => b.weight - a.weight);
const top = findings.slice(0, 3).map((f) => f.text);
lines.push(`## Top findings`, ``, ...(top.length ? top.map((t, i) => `${i + 1}. ${t}`) : ["1. No measurable differences between the two runs."]), ``,
  `_Lower is better for every timing/CLS/error row; ✅ = moved in the good direction, ⚠️ = regressed. Score formula: ${A.sc?.formula ?? B.sc?.formula ?? "see score.json"}_`, ``);
out.top_findings = top;
fs.writeFileSync(path.join(PROOF, "compare.md"), lines.join("\n"));
fs.writeFileSync(path.join(PROOF, "compare.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ smoothness: out.smoothness, top_findings: top }));

// legacy full comparison from web/artifacts (optional)
try {
  const J = (f) => JSON.parse(fs.readFileSync(path.join(ART, f), "utf8"));
  const cmp = (b, a) => ({ before: b ?? null, after: a ?? null, delta: num(b) != null && num(a) != null ? +(a - b).toFixed(1) : null });
  const TL_KEYS = ["first_sse_frame", "first_thinking_visible", "plan_created", "plan_visible", "first_between_step_summary", "first_between_step_summary_visible", "between_step_summary_done", "summary_done_visible", "first_inline_citation_chip", "first_answer_token", "first_answer_paint", "first_source_in_rail", "final_badge_visible", "error_card_visible", "done", "total_ms", "composer_reset_ms", "frame_count", "request_body_disclosed", "model_row_text"];
  const legacy = { generated_utc: new Date().toISOString(), viewports: {}, smoothness: { before: J(`smoothness-${BL}.json`).overall, after: J(`smoothness-${AL}.json`).overall } };
  for (const vp of ["desktop", "mobile"]) {
    if (!fs.existsSync(path.join(ART, `timeline-${BL}-${vp}.json`)) || !fs.existsSync(path.join(ART, `timeline-${AL}-${vp}.json`))) continue;
    const Bt = J(`timeline-${BL}-${vp}.json`), At = J(`timeline-${AL}-${vp}.json`); const v = { turns: {} };
    for (const t of ["turn1", "turn2"]) { const tb = Bt[t], ta = At[t]; const timeline = {}; for (const k of TL_KEYS) timeline[k] = typeof tb[k] === "number" || typeof ta[k] === "number" ? cmp(tb[k], ta[k]) : { before: tb[k] ?? null, after: ta[k] ?? null }; v.turns[t] = { prompt: ta.prompt, timeline, metrics: { before: Bt.metrics[t], after: At.metrics[t] } }; }
    legacy.viewports[vp] = v;
  }
  if (Object.keys(legacy.viewports).length) fs.writeFileSync(path.join(ART, "timeline-comparison.json"), JSON.stringify(legacy, null, 2));
} catch { /* artifacts absent — docs/proof comparison is the deliverable */ }
