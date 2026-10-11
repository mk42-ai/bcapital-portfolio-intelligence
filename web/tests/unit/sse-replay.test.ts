/**
 * sse-replay.test.ts — replays the RECORDED bridge fixture (web/tests/fixtures/sse/portfolio-movers.bridge.ndjson, a real 2-plugin
 * /api/chat run against the pass-3 deployment) through the pure client pieces and asserts the run-UX contract. Run with tsx (no framework):
 *   cd web && npm run test:sse-replay      (= node ../node_modules/tsx/dist/cli.mjs tests/unit/sse-replay.test.ts)
 * Same style as eventmap.test.ts: exits non-zero on any FAIL. Items marked `todo` are KNOWN app defects visible in the recording —
 * the assertion is kept and printed but does not fail the run (see tests/fixtures/sse/README.md).
 */
import path from "node:path";
import { parseFrame, classifyClientFrame, isPlannerPayloadFrame } from "../../src/lib/ondemand/sse-adapter";
// The harness is plain ESM JS (also runnable via `node scripts/replay-sse-fixture.mjs <file>`).
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — .mjs without a declaration file; tests/ is excluded from tsc
import { loadFixture, replayBridge, replayUpstream, JSON_OBJECTIVE_RE } from "../../scripts/replay-sse-fixture.mjs";

const PORTFOLIO = "plugin-1791713636"; const PERPLEXITY = "plugin-1722260873";
const FIX = path.resolve(__dirname, "../fixtures/sse");

let pass = 0; const failures: string[] = []; const todos: string[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => { if (ok) { pass++; console.log(`  ok   ${name}`); } else { failures.push(name); console.log(`  FAIL ${name}${detail !== undefined ? ` → ${JSON.stringify(detail)}` : ""}`); } };
/** Known app defect: assertion kept, reported as todo, does not fail the run. Flips to a normal check once it passes. */
const todo = (name: string, ok: boolean, detail?: unknown) => { if (ok) { pass++; console.log(`  ok   ${name} (todo resolved — promote to check)`); } else { todos.push(name); console.log(`  TODO ${name}${detail !== undefined ? ` → ${JSON.stringify(detail)}` : ""}`); } };

type Tool = { name: string; pluginId: string | null; status: string | null; isError: boolean; paired: boolean; startMs: number | null; resultMs: number | null };

console.log("sse-replay: bridge fixture portfolio-movers.bridge.ndjson");
const bridge = loadFixture(path.join(FIX, "portfolio-movers.bridge.ndjson"));
const s = replayBridge(bridge.records, { classifyClientFrame, isPlannerPayloadFrame, guard: null });
const tools: Tool[] = s.tools;
check("fixture loads (≥ 100 frames)", s.frames >= 100, s.frames);
check("every frame classifies as a known family (no unknown CUSTOM names)", s.families.unknown === 0, s.unknownNames);
check("no unparseable data frames", s.unparsed === 0, s.unparsed);
check(`≥1 TOOL_CALL_START for Portfolio Plugin ${PORTFOLIO}`, tools.some((t) => t.pluginId === PORTFOLIO && t.startMs != null), tools);
check(`≥1 TOOL_CALL_START for Perplexity ${PERPLEXITY}`, tools.some((t) => t.pluginId === PERPLEXITY && t.startMs != null), tools);
check("every TOOL_CALL_START has a TOOL_CALL_RESULT (and no orphan results)", s.toolsAllPaired && tools.length === s.counts.TOOL_CALL_START, tools.map((t) => [t.name, t.paired]));
check("TOOL_CALL_RESULT carries status ok|error and isError only on error", tools.every((t) => (t.status === "ok" && !t.isError) || (t.status === "error" && t.isError)), tools);
// Known defect (recorded 2026-10-11): the bridge emits both TOOL_CALL_RESULT frames at stream close (31279 ms), AFTER the answer started
// streaming at 25627 ms — so the tool rows stay "running" while the answer is already visible. Real contract: results before first answer token.
todo("first TEXT_MESSAGE_CONTENT comes after the last TOOL_CALL_RESULT", s.text.firstTextAfterLastToolResult === true, { firstTextMs: s.text.firstMs, lastToolResultMs: s.text.lastToolResultMs });
check("answer text present (≥ 200 chars)", s.text.chars >= 200, s.text.chars);
check("[DONE] present", s.terminal.done === true, s.terminal);
check("RUN_FINISHED present and no RUN_ERROR", s.terminal.runFinished === true && s.terminal.runError == null, s.terminal);
check("[DONE] is the last frame", bridge.records.at(-1)?.data === "[DONE]", bridge.records.at(-1));
check("0 JSON-looking ondemand.thinking deltas (planner JSON is split into ondemand.planner_payload)", s.thinking.jsonLike === 0, s.thinking);
check("ondemand.planner_payload frames present and well-shaped", s.thinking.plannerPayloadFrames > 0 && !s.unknownNames["planner_payload:badshape"], s.thinking);
check("ondemand.plan frame present", s.plan.frames >= 1, s.plan);
check("final ondemand.plan objective is a non-JSON first-person sentence", typeof s.plan.final?.objective === "string" && s.plan.final.objective.length > 10 && !JSON_OBJECTIVE_RE.test(s.plan.final.objective) && /^I'?ll\b/i.test(s.plan.final.objective), s.plan.final);
check("every ondemand.plan frame objective is non-JSON", s.plan.all.every((p: { objective: string | null }) => !p.objective || !JSON_OBJECTIVE_RE.test(p.objective)), s.plan.all);
check("final plan has ≥ 1 step", (s.plan.final?.steps ?? 0) >= 1, s.plan.final);
check("first-seen order: RUN_STARTED → TOOL_CALL_START → ondemand.plan → TEXT_MESSAGE_CONTENT → RUN_FINISHED → [DONE]", (() => { const o = s.firstSeen.map((f: { kind: string }) => f.kind); const want = ["RUN_STARTED", "TOOL_CALL_START", "CUSTOM:ondemand.plan", "TEXT_MESSAGE_CONTENT", "RUN_FINISHED", "[DONE]"]; let last = -1; return want.every((k) => { const i = o.indexOf(k); const ok = i > last; last = i; return ok; }); })(), s.firstSeen);
check("fixture carries no secrets (apikey / Bearer)", !/apikey|Bearer\s+[A-Za-z0-9]/i.test(JSON.stringify(bridge.records)));

console.log("sse-replay: upstream fixture portfolio-movers.upstream.sse (raw OnDemand ground truth)");
const up = loadFixture(path.join(FIX, "portfolio-movers.upstream.sse"));
const u = replayUpstream(up.records, { parseFrame });
check("upstream fixture loads (≥ 50 data frames)", u.frames >= 50, u.frames);
check("parseFrame binds every upstream frame (0 unknown)", u.unknown === 0, u.unknownTypes);
check("upstream has planning_output + step_output + fulfillment + metricsLog + [DONE]", ["thinking/planning_output", "thinking/step_output", "message/fulfillment", "message/metricsLog", "[DONE]"].every((k) => (u.counts[k] ?? 0) >= 1), u.counts);
check("upstream answer chars > 0", u.answerChars > 0, u.answerChars);
check("upstream fixture carries no secrets", !/apikey/i.test(JSON.stringify(up.records)));

console.log(`\n${pass} passed, ${failures.length} failed, ${todos.length} todo${todos.length ? ` (${todos.join("; ")})` : ""}`);
if (failures.length) { console.log("FAILURES:\n  " + failures.join("\n  ")); process.exit(1); }
