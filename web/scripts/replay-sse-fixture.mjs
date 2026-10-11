#!/usr/bin/env node
// a13 — SSE fixture replay harness. Streams a recorded fixture through the PURE client pieces (no React):
//   bridge  .ndjson  (web/tests/fixtures/sse/*.bridge.ndjson, one {ms, data} per /api/chat `data:` frame)  → classifyClientFrame + frame guard
//   upstream .sse    (web/tests/fixtures/sse/*.upstream.sse, raw OnDemand lines "+<ms> event:/data:")        → parseFrame (sse-adapter.ts)
// Usage:  cd web && node scripts/replay-sse-fixture.mjs tests/fixtures/sse/portfolio-movers.bridge.ndjson [--json]
// The script imports TypeScript sources, so when run under plain `node` it re-executes itself under tsx (../node_modules/tsx).
// Also importable: `import { loadFixture, replayBridge, replayUpstream } from "../../scripts/replay-sse-fixture.mjs"` (see tests/unit/sse-replay.test.ts).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, "..");

/** Same heuristic as web/scripts/record-run-check.mjs (PAYLOAD_RE) — "does this ondemand.thinking delta look like planner JSON?" */
export const PAYLOAD_RE = /"pluginId"|"api_request_parameters"|"operationId"|chars each|^\s*(?:```(?:json)?\s*)?[\[{]/;
export const looksLikePayload = (delta, acc = "") => PAYLOAD_RE.test(delta) || /"pluginId"|"api_request_parameters"|"operationId"|chars each/.test(acc.slice(-400));
/** An objective that is itself JSON / a code fence / contains plugin ids is a defect (route.ts promises a plain first-person sentence). */
export const JSON_OBJECTIVE_RE = /^\s*(?:```|[\[{])|"(?:title|objective|steps|user_query|pluginId)"\s*:/;

async function loadAdapter() {
  const mod = await import(pathToFileURL(path.join(WEB, "src/lib/ondemand/sse-adapter.ts")).href);
  // a7 frame guard (optional): accept any of the names that lane used; fall back to a permissive guard.
  let guard = null;
  for (const name of ["isClientFrame", "guardFrame", "isValidClientFrame", "frameGuard"]) if (typeof mod[name] === "function") { guard = { name, fn: mod[name] }; break; }
  if (!guard) {
    for (const file of ["frame-guard.ts", "frameGuard.ts"]) {
      const p = path.join(WEB, "src/lib/ondemand", file);
      if (fs.existsSync(p)) { const g = await import(pathToFileURL(p).href); const k = Object.keys(g).find((x) => typeof g[x] === "function"); if (k) guard = { name: `${file}:${k}`, fn: g[k] }; }
    }
  }
  return { parseFrame: mod.parseFrame, classifyClientFrame: mod.classifyClientFrame, isPlannerPayloadFrame: mod.isPlannerPayloadFrame, guard };
}

/** Load a fixture into ordered records: bridge → [{ms, event?, data}], upstream → [{ms, event, data}] (event: lines folded onto the next data:). */
export function loadFixture(file) {
  const text = fs.readFileSync(file, "utf8");
  if (file.endsWith(".ndjson")) return { format: "bridge", records: text.split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => typeof r.data === "string") };
  const records = []; let curEvent = "";
  for (const raw of text.split("\n")) {
    const m = /^\+\s*(\d+) (.*)$/.exec(raw); if (!m) continue;
    const ms = Number(m[1]); const line = m[2];
    if (line.startsWith("event:")) { curEvent = line.slice(6).trim(); continue; }
    if (line.startsWith("data:")) records.push({ ms, event: curEvent, data: line.slice(5).trim() });
  }
  return { format: "upstream", records };
}

/** Replay a bridge (.ndjson) fixture through classifyClientFrame (+ frame guard when present). Pure; returns a summary object. */
export function replayBridge(records, { classifyClientFrame, isPlannerPayloadFrame, guard }) {
  const counts = {}; const firstSeen = []; const seen = new Set(); const families = { attachments: 0, voice: 0, known: 0, unknown: 0 };
  const unknownNames = {}; const tools = new Map(); const toolOrder = [];
  let plannerPayloadFrames = 0, plannerPayloadChars = 0, thinkingFrames = 0, jsonLikeThinking = 0, thinkingAcc = ""; const jsonLikeSamples = [];
  let firstTextIdx = -1, firstTextMs = null, lastToolResultIdx = -1, lastToolResultMs = null, textChars = 0;
  let doneSeen = false, runFinished = false, runError = null, unparsed = 0, guardRejected = 0;
  const plans = []; const statuses = [];
  records.forEach((rec, i) => {
    const { ms, data } = rec;
    if (data === "[DONE]") { doneSeen = true; bump("[DONE]", ms); return; }
    let ev; try { ev = JSON.parse(data); } catch { unparsed++; bump("UNPARSED", ms); return; }
    const kind = ev.type === "CUSTOM" ? `CUSTOM:${ev.name}` : String(ev.type ?? "?");
    bump(kind, ms);
    const fam = classifyClientFrame(ev); families[fam]++;
    if (fam === "unknown") unknownNames[kind] = (unknownNames[kind] ?? 0) + 1;
    if (guard && !guard.fn(ev)) guardRejected++;
    switch (ev.type) {
      case "TOOL_CALL_START": { const t = { id: ev.toolCallId, name: ev.toolCallName, pluginId: null, startMs: ms, startIdx: i, resultMs: null, resultIdx: -1, status: null, isError: false }; tools.set(ev.toolCallId, t); toolOrder.push(t); break; }
      case "TOOL_CALL_ARGS": { const t = tools.get(ev.toolCallId); if (t) { try { const a = JSON.parse(ev.delta ?? "{}"); t.pluginId = a.pluginId ?? t.pluginId; t.stepId = a.stepId ?? t.stepId; } catch { /* partial args */ } } break; }
      case "TOOL_CALL_RESULT": { const t = tools.get(ev.toolCallId); let c = ev.content; if (typeof c === "string") { try { c = JSON.parse(c); } catch { /* keep */ } } if (t) { t.resultMs = ms; t.resultIdx = i; t.status = c?.status ?? (ev.isError ? "error" : "ok"); t.isError = !!ev.isError; t.pluginId = t.pluginId ?? c?.pluginId ?? null; t.message = c?.message; } else toolOrder.push({ id: ev.toolCallId, name: "(orphan result)", startIdx: -1, resultIdx: i, resultMs: ms, status: c?.status, isError: !!ev.isError }); lastToolResultIdx = i; lastToolResultMs = ms; break; }
      case "TEXT_MESSAGE_CONTENT": { if (firstTextIdx < 0) { firstTextIdx = i; firstTextMs = ms; } textChars += String(ev.delta ?? "").length; break; }
      case "RUN_FINISHED": runFinished = true; break;
      case "RUN_ERROR": runError = String(ev.message ?? "RUN_ERROR"); break;
      case "CUSTOM": {
        const v = ev.value ?? {};
        if (ev.name === "ondemand.thinking") { thinkingFrames++; const d = String(v.delta ?? ""); if (looksLikePayload(d, thinkingAcc)) { jsonLikeThinking++; if (jsonLikeSamples.length < 5) jsonLikeSamples.push(d.slice(0, 120)); } thinkingAcc = (thinkingAcc + d).slice(-4000); }
        else if (ev.name === "ondemand.planner_payload") { plannerPayloadFrames++; plannerPayloadChars += String(v.delta ?? "").length; if (isPlannerPayloadFrame && !isPlannerPayloadFrame(v)) unknownNames["planner_payload:badshape"] = (unknownNames["planner_payload:badshape"] ?? 0) + 1; }
        else if (ev.name === "ondemand.plan") plans.push({ ms, idx: i, objective: v.objective ?? null, steps: (v.steps ?? []).length, source: v.source ?? null, provisional: !!v.provisional });
        else if (ev.name === "ondemand.status") statuses.push({ ms, phase: v.phase, statusType: v.statusType });
        break;
      }
      default: break;
    }
  });
  function bump(k, ms) { counts[k] = (counts[k] ?? 0) + 1; if (!seen.has(k)) { seen.add(k); firstSeen.push({ kind: k, ms }); } }
  const finalPlan = plans.at(-1) ?? null;
  return {
    format: "bridge", frames: records.length, durationMs: records.at(-1)?.ms ?? 0, counts, firstSeen, families, unknownNames, guard: guard ? { name: guard.name, rejected: guardRejected } : null, unparsed,
    tools: toolOrder.map((t) => ({ name: t.name, pluginId: t.pluginId, stepId: t.stepId ?? null, startMs: t.startMs ?? null, resultMs: t.resultMs, status: t.status, isError: t.isError, message: t.message ?? null, paired: t.startIdx >= 0 && t.resultIdx >= 0 })),
    toolsAllPaired: toolOrder.every((t) => t.startIdx >= 0 && t.resultIdx >= 0),
    thinking: { frames: thinkingFrames, jsonLike: jsonLikeThinking, jsonLikeSamples, plannerPayloadFrames, plannerPayloadChars },
    plan: { frames: plans.length, final: finalPlan, objectiveLooksJson: finalPlan?.objective ? JSON_OBJECTIVE_RE.test(finalPlan.objective) : null, all: plans },
    text: { firstMs: firstTextMs, firstIdx: firstTextIdx, chars: textChars, lastToolResultMs, lastToolResultIdx, firstTextAfterLastToolResult: firstTextIdx >= 0 && lastToolResultIdx >= 0 ? firstTextIdx > lastToolResultIdx : null },
    terminal: { done: doneSeen, runFinished, runError },
    statuses,
  };
}

/** Replay an upstream (.sse) fixture through parseFrame. */
export function replayUpstream(records, { parseFrame }) {
  const counts = {}; const kinds = {}; const firstSeen = []; const seen = new Set(); let done = false, unknown = 0, answerChars = 0; const unknownTypes = {};
  for (const { ms, event, data } of records) {
    if (data === "[DONE]") { done = true; bump("[DONE]", ms); continue; }
    let et = "?"; try { const j = JSON.parse(data); et = j.eventType ?? j.type ?? "?"; } catch { et = "<unparseable>"; }
    bump(`${event}/${et}`, ms);
    const u = parseFrame(event, data); kinds[u.kind] = (kinds[u.kind] ?? 0) + 1;
    if (u.kind === "unknown") { unknown++; unknownTypes[et] = (unknownTypes[et] ?? 0) + 1; }
    if (u.kind === "answer") answerChars += String(u.delta ?? u.text ?? u.answer ?? "").length;
  }
  function bump(k, ms) { counts[k] = (counts[k] ?? 0) + 1; if (!seen.has(k)) { seen.add(k); firstSeen.push({ kind: k, ms }); } }
  return { format: "upstream", frames: records.length, durationMs: records.at(-1)?.ms ?? 0, counts, kinds, firstSeen, unknown, unknownTypes, answerChars, terminal: { done } };
}

export async function replayFile(file) {
  const adapter = await loadAdapter(); const fx = loadFixture(file);
  return fx.format === "bridge" ? replayBridge(fx.records, adapter) : replayUpstream(fx.records, adapter);
}

function printSummary(file, s) {
  console.log(`replay ${path.relative(process.cwd(), file)} — ${s.format}, ${s.frames} frames, ${s.durationMs} ms`);
  console.log("counts per kind:"); for (const [k, v] of Object.entries(s.counts).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
  console.log("first-seen order: " + s.firstSeen.map((f) => `${f.kind}@${f.ms}`).join(" → "));
  if (s.format === "bridge") {
    console.log(`families: ${JSON.stringify(s.families)}${Object.keys(s.unknownNames).length ? ` unknown=${JSON.stringify(s.unknownNames)}` : ""}${s.guard ? ` guard(${s.guard.name}) rejected=${s.guard.rejected}` : " guard: none"}`);
    console.log("tool rows (start → result):"); for (const t of s.tools) console.log(`  ${t.paired ? "ok  " : "MISS"} ${t.name} [${t.pluginId ?? "?"}] step=${t.stepId ?? "-"} start@${t.startMs} result@${t.resultMs} status=${t.status}${t.isError ? ` ERROR: ${t.message}` : ""}`);
    console.log(`planner_payload frames: ${s.thinking.plannerPayloadFrames} (${s.thinking.plannerPayloadChars} chars) · thinking frames: ${s.thinking.frames} · JSON-looking thinking: ${s.thinking.jsonLike}${s.thinking.jsonLikeSamples.length ? ` samples=${JSON.stringify(s.thinking.jsonLikeSamples)}` : ""}`);
    console.log(`plan frames: ${s.plan.frames} · final objective: ${JSON.stringify(s.plan.final?.objective ?? null)} (${s.plan.final?.steps ?? 0} steps, looksJson=${s.plan.objectiveLooksJson})`);
    console.log(`first TEXT_MESSAGE_CONTENT @${s.text.firstMs} · last TOOL_CALL_RESULT @${s.text.lastToolResultMs} · text after tools: ${s.text.firstTextAfterLastToolResult} · ${s.text.chars} answer chars`);
  } else {
    console.log(`parseFrame kinds: ${JSON.stringify(s.kinds)} · unknown=${s.unknown}${s.unknown ? ` ${JSON.stringify(s.unknownTypes)}` : ""} · answer chars ${s.answerChars}`);
  }
  console.log(`terminal: ${JSON.stringify(s.terminal)}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!file) { console.error("usage: node scripts/replay-sse-fixture.mjs <fixture.(bridge.ndjson|upstream.sse)> [--json]"); process.exit(2); }
  if (!process.versions.tsx && !process.env.A13_TSX) {
    // plain node cannot import the .ts adapter → re-exec under tsx
    const tsx = path.join(WEB, "..", "node_modules", "tsx", "dist", "cli.mjs");
    const r = spawnSync(process.execPath, [tsx, fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: "inherit", env: { ...process.env, A13_TSX: "1" } });
    process.exit(r.status ?? 1);
  }
  // no top-level await: the test file (CJS under tsx) requires this module
  replayFile(path.resolve(file)).then((s) => { if (process.argv.includes("--json")) console.log(JSON.stringify(s, null, 2)); else printSummary(path.resolve(file), s); }, (e) => { console.error(e); process.exit(1); });
}
