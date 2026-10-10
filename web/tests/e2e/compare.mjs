#!/usr/bin/env node
// Builds artifacts/timeline-comparison.json: every timeline key and every smoothness metric, before vs after, with deltas (after − before).
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const ART = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "artifacts");
const J = (f) => JSON.parse(fs.readFileSync(path.join(ART, f), "utf8"));
const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);
const cmp = (b, a) => ({ before: b ?? null, after: a ?? null, delta: num(b) != null && num(a) != null ? +(a - b).toFixed(1) : null });
const TL_KEYS = ["first_sse_frame", "first_thinking_visible", "plan_created", "plan_visible", "first_between_step_summary", "first_between_step_summary_visible", "between_step_summary_done", "summary_done_visible", "first_inline_citation_chip", "first_answer_token", "first_answer_paint", "first_source_in_rail", "final_badge_visible", "error_card_visible", "done", "total_ms", "composer_reset_ms", "frame_count", "request_body_disclosed", "model_row_text"];
const out = { generated_utc: new Date().toISOString(), viewports: {}, smoothness: { before: J("smoothness-before.json").overall, after: J("smoothness-after.json").overall }, formula: J("smoothness-after.json").formula };
out.smoothness.delta = +(out.smoothness.after - out.smoothness.before).toFixed(2);
for (const vp of ["desktop", "mobile"]) {
  const B = J(`timeline-before-${vp}.json`), A = J(`timeline-after-${vp}.json`); const SB = J("smoothness-before.json").viewports[vp], SA = J("smoothness-after.json").viewports[vp];
  const v = { overall_score: cmp(SB.overall, SA.overall), growth_pass: { before: SB.growth.pass, after: SA.growth.pass, failed_before: SB.growth.failed_assertions, failed_after: SA.growth.failed_assertions }, turns: {} };
  for (const t of ["turn1", "turn2"]) {
    const tb = B[t], ta = A[t], mb = B.metrics[t], ma = A.metrics[t];
    const timeline = {}; for (const k of TL_KEYS) timeline[k] = typeof tb[k] === "number" || typeof ta[k] === "number" ? cmp(tb[k], ta[k]) : { before: tb[k] ?? null, after: ta[k] ?? null };
    timeline.plugins = { before: tb.plugins.map((p) => ({ id: p.id, start_ms: p.start_ms, end_ms: p.end_ms, status: p.status, sources: p.sources })), after: ta.plugins.map((p) => ({ id: p.id, start_ms: p.start_ms, end_ms: p.end_ms, status: p.status, sources: p.sources })) };
    timeline.perplexity_status = { before: tb.perplexity.status, after: ta.perplexity.status };
    const metrics = {
      score: cmp(SB[t].score, SA[t].score), penalties: { before: SB[t].penalties, after: SA[t].penalties },
      dead_air_gaps_count: cmp(mb.dead_air_gaps.count, ma.dead_air_gaps.count), gaps_over_800_any: cmp(mb.dead_air_gaps.gaps_over_800_any, ma.dead_air_gaps.gaps_over_800_any), gaps_bridged_by_filler: cmp(mb.dead_air_gaps.gaps_bridged_by_filler, ma.dead_air_gaps.gaps_bridged_by_filler), max_gap_ms: cmp(mb.dead_air_gaps.max_gap_ms, ma.dead_air_gaps.max_gap_ms),
      cumulative_layout_shift: cmp(mb.cumulative_layout_shift.value, ma.cumulative_layout_shift.value), layout_shift_count: cmp(mb.cumulative_layout_shift.shifts, ma.cumulative_layout_shift.shifts), top_shifting_nodes: { before: mb.cumulative_layout_shift.top_nodes.slice(0, 3), after: ma.cumulative_layout_shift.top_nodes.slice(0, 3) },
      long_frames_over_50ms: cmp(mb.scroll_jank.long_frames_over_50ms, ma.scroll_jank.long_frames_over_50ms), long_frame_max_ms: cmp(mb.scroll_jank.max_ms, ma.scroll_jank.max_ms),
      console_errors: cmp(mb.console_errors.count, ma.console_errors.count), page_errors: cmp(mb.page_errors.count, ma.page_errors.count), failed_requests: cmp(mb.failed_requests.count, ma.failed_requests.count), favicon_failures: cmp(mb.failed_requests.favicon_failures, ma.failed_requests.favicon_failures),
      visible_dom_changes: cmp(mb.visible_dom_changes, ma.visible_dom_changes),
    };
    v.turns[t] = { prompt: ta.prompt, timeline, metrics };
  }
  out.viewports[vp] = v;
}
fs.writeFileSync(path.join(ART, "timeline-comparison.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ smoothness: out.smoothness, desktop: out.viewports.desktop.overall_score, mobile: out.viewports.mobile.overall_score }));
