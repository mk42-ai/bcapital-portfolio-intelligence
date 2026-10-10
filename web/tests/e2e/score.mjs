#!/usr/bin/env node
// Smoothness scorer for the run-ux recorder output. Usage: node tests/e2e/score.mjs before|after  → artifacts/smoothness-<label>.json
// Formula (documented in the output): start 10; −1 per dead-air gap >800 ms (cap −4); −2 if CLS >0.1 (−1 if >0.05); −1 per 3 long frames >50 ms (cap −2);
// −1 per console/page error (cap −2); −1 if any GROWTH colour/keyboard assertion fails. Per turn and overall (overall = mean of turns, with the GROWTH
// penalty applied once per viewport).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ART = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "artifacts");
const label = process.argv[2] ?? "before";
const FORMULA = "start 10; −1 per dead-air gap >800 ms between consecutive VISIBLE DOM changes with no filler/progress element changing and no in-viewport filler animation running (cap −4); −2 if cumulative layout shift (non-input, send→[DONE]) >0.1, −1 if >0.05; −1 per 3 long animation frames >50 ms (cap −2); −1 per console error or page error (cap −2); −1 if any GROWTH colour/keyboard assertion fails (applied once per viewport). Turn score = 10 − turn penalties − GROWTH penalty; overall per viewport = mean(turn1, turn2); overall = mean of viewports.";
const out = { label, generated_utc: new Date().toISOString(), formula: FORMULA, viewports: {}, overall: null };
const scores = [];
for (const vp of ["desktop", "mobile"]) {
  const f = path.join(ART, `timeline-${label}-${vp}.json`);
  if (!fs.existsSync(f)) continue;
  const d = JSON.parse(fs.readFileSync(f, "utf8"));
  const growthFail = d.growth && d.growth.pass === false;
  const growthPenalty = growthFail ? 1 : 0;
  const turns = {};
  const turnScores = [];
  for (const t of ["turn1", "turn2"]) {
    const m = d.metrics[t]; const tl = d[t];
    const dead = m.dead_air_gaps.count; const cls = m.cumulative_layout_shift.value; const lf = m.scroll_jank.long_frames_over_50ms; const errs = m.console_errors.count + m.page_errors.count;
    const pen = { dead_air: Math.min(4, dead), cls: cls > 0.1 ? 2 : cls > 0.05 ? 1 : 0, long_frames: Math.min(2, Math.floor(lf / 3)), errors: Math.min(2, errs), growth: growthPenalty };
    const score = Math.max(0, 10 - pen.dead_air - pen.cls - pen.long_frames - pen.errors - pen.growth);
    turnScores.push(score);
    turns[t] = {
      score, penalties: pen,
      metrics: {
        stream_window_ms: m.stream_window_ms, total_ms: tl.total_ms, first_sse_frame_ms: tl.first_sse_frame, first_answer_token_ms: tl.first_answer_token, done_ms: tl.done,
        dead_air_gaps: { count: dead, gaps: m.dead_air_gaps.gaps, gaps_over_800_any: m.dead_air_gaps.gaps_over_800_any, gaps_bridged_by_filler: m.dead_air_gaps.gaps_bridged_by_filler, max_gap_ms: m.dead_air_gaps.max_gap_ms },
        cumulative_layout_shift: m.cumulative_layout_shift,
        scroll_jank: m.scroll_jank,
        console_errors: m.console_errors, page_errors: m.page_errors, failed_requests: m.failed_requests,
        perplexity: tl.perplexity, plugins: tl.plugins.map((p) => ({ id: p.id, name: p.name, start_ms: p.start_ms, end_ms: p.end_ms, status: p.status, sources: p.sources })),
      },
    };
  }
  const overall = +(turnScores.reduce((a, b) => a + b, 0) / turnScores.length).toFixed(2);
  scores.push(overall);
  out.viewports[vp] = { turn1: turns.turn1, turn2: turns.turn2, overall, growth: { pass: !growthFail, failed_assertions: d.growth?.failed ?? [], tokens: d.growth?.tokens ?? null, hover: d.growth?.hover ?? null, expanded: d.growth?.expanded ?? null, keyboard_reached: d.growth?.keyboard?.reached ?? null, assertions: d.growth?.assertions ?? [] }, notes: d.notes };
}
out.overall = scores.length ? +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : null;
fs.writeFileSync(path.join(ART, `smoothness-${label}.json`), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ label, overall: out.overall, ...Object.fromEntries(Object.entries(out.viewports).map(([k, v]) => [k, { turn1: v.turn1.score, turn2: v.turn2.score, overall: v.overall, pen1: v.turn1.penalties, pen2: v.turn2.penalties }])) }, null, 1));
