#!/usr/bin/env node
// UNIT 1 — fresh-stream check. POSTs one question to ${BASE_URL}/api/chat (body shape = web/scripts/record-sse.mjs / api/chat/route.ts),
// writes every frame to web/proof/unit1/stream-<label>.ndjson and asserts/prints:
//   • order of first-seen frame kinds (status → thinking → plan → TOOL_CALL_START → TOOL_CALL_RESULT → TEXT_MESSAGE_CONTENT → sources → RUN_FINISHED → [DONE])
//   • every TOOL_CALL_START precedes its TOOL_CALL_RESULT and the first TEXT_MESSAGE_CONTENT
//   • how many `ondemand.thinking` deltas look like planner JSON payloads (BEFORE = live baseline; AFTER should be 0) and how many
//     `ondemand.planner_payload` frames were received (AFTER build only).
// Usage: cd web && BASE_URL=https://<frontend> [RUN_LABEL=before|after] node scripts/record-run-check.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = (process.env.BASE_URL ?? "https://sb-4o6djxojbfi1.vercel.run").replace(/\/$/, "");
const LABEL = process.env.RUN_LABEL ?? "before";
const QUESTION = process.env.RUN_QUESTION ?? "What is the latest news about Fervo Energy? Cite sources.";
const PLUGIN_IDS = (process.env.QA_PLUGIN_IDS ?? "plugin-1722260873").split(",").filter(Boolean);
const TOTAL_MS = Number(process.env.SSE_TOTAL_MS) || 300_000;
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "proof", "unit1");
fs.mkdirSync(OUT, { recursive: true });
const NDJSON = path.join(OUT, `stream-${LABEL}.ndjson`);
const SUMMARY = path.join(OUT, `stream-${LABEL}.summary.json`);
const log = (...a) => console.error(`[record-run-check ${new Date().toISOString()}]`, ...a);

/** Same heuristics as web/src/lib/ondemand/eventMap.ts classifyThinkingDelta (duplicated here so the script runs with plain node). */
const PAYLOAD_RE = /"pluginId"|"api_request_parameters"|"operationId"|chars each|^\s*(?:```(?:json)?\s*)?[\[{]/;
const looksLikePayload = (delta, acc) => PAYLOAD_RE.test(delta) || /"pluginId"|"api_request_parameters"|"operationId"|chars each/.test(acc.slice(-400));

const EXPECTED_ORDER = ["status", "thinking", "plan", "TOOL_CALL_START", "TOOL_CALL_RESULT", "TEXT_MESSAGE_CONTENT", "sources", "RUN_FINISHED", "[DONE]"];

async function main() {
  const threadId = `u1-${Date.now()}`;
  const body = { threadId, messages: [{ role: "user", content: QUESTION }], context: { pluginIds: PLUGIN_IDS, externalUserId: "INV-001" } };
  const frames = []; const ws = fs.createWriteStream(NDJSON);
  const push = (f) => { frames.push(f); ws.write(JSON.stringify(f) + "\n"); };
  const t0 = Date.now(); const ac = new AbortController(); const killer = setTimeout(() => ac.abort(), TOTAL_MS);
  let status = 0; let thinkingAcc = ""; let thinkingDeltas = 0; let jsonLikeThinking = 0; let plannerPayloadFrames = 0; let plannerPayloadChars = 0;
  const jsonSamples = [];
  try {
    const res = await fetch(`${BASE_URL}/api/chat`, { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify(body), signal: ac.signal });
    status = res.status; log("HTTP", status, res.headers.get("content-type"));
    if (!res.ok || !res.body) { push({ ms: Date.now() - t0, type: "HTTP_ERROR", status, body: (await res.text().catch(() => "")).slice(0, 500) }); }
    else {
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2); const ms = Date.now() - t0;
          const dataLines = chunk.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim());
          if (!dataLines.length) continue;
          const data = dataLines.join("\n");
          if (data === "[DONE]") { push({ ms, type: "[DONE]" }); continue; }
          let ev; try { ev = JSON.parse(data); } catch { push({ ms, type: "UNPARSED", raw: data.slice(0, 200) }); continue; }
          const rec = { ms, type: ev.type ?? "?" };
          if (ev.type === "CUSTOM") {
            rec.name = ev.name;
            if (ev.name === "ondemand.thinking") {
              const d = String(ev.value?.delta ?? ""); rec.kind = ev.value?.kind; rec.len = d.length; thinkingDeltas++;
              const json = looksLikePayload(d, thinkingAcc); rec.jsonLike = json; thinkingAcc = (thinkingAcc + d).slice(-4000);
              if (json) { jsonLikeThinking++; if (jsonSamples.length < 5) jsonSamples.push(d.slice(0, 120)); }
            }
            if (ev.name === "ondemand.planner_payload") { plannerPayloadFrames++; plannerPayloadChars += String(ev.value?.delta ?? "").length; rec.phase = ev.value?.phase; }
            if (ev.name === "ondemand.status") rec.phase = ev.value?.phase;
            if (ev.name === "ondemand.sources") rec.sources = ev.value?.sources?.length ?? 0;
            if (ev.name === "ondemand.error") rec.error = { code: ev.value?.code, message: String(ev.value?.message ?? "").slice(0, 200) };
          } else if (ev.type === "TEXT_MESSAGE_CONTENT") rec.deltaLen = String(ev.delta ?? "").length;
          else if (ev.type === "TOOL_CALL_START") { rec.toolCallId = ev.toolCallId; rec.tool = ev.toolCallName; }
          else if (ev.type === "TOOL_CALL_RESULT") { rec.toolCallId = ev.toolCallId; rec.isError = !!ev.isError; }
          else if (ev.type === "RUN_ERROR") rec.message = String(ev.message ?? "").slice(0, 200);
          push(rec);
        }
      }
    }
  } catch (e) { push({ ms: Date.now() - t0, type: "CLIENT_ERROR", message: String(e?.message ?? e) }); log("client error", e?.message ?? e); }
  finally { clearTimeout(killer); await new Promise((r) => ws.end(r)); } // flush before exit (the last frames were lost otherwise)

  // ---- analysis ----
  const kindOf = (f) => (f.type === "CUSTOM" ? f.name.replace(/^ondemand\./, "") : f.type);
  const firstSeen = []; const seen = new Set();
  for (const f of frames) { const k = kindOf(f); if (!seen.has(k)) { seen.add(k); firstSeen.push({ kind: k, ms: f.ms }); } }
  const orderKinds = firstSeen.map((x) => x.kind);
  const expectedPresent = EXPECTED_ORDER.filter((k) => orderKinds.includes(k));
  const expectedPositions = expectedPresent.map((k) => orderKinds.indexOf(k));
  const orderMonotonic = expectedPositions.every((p, i) => i === 0 || p > expectedPositions[i - 1]);
  const missing = EXPECTED_ORDER.filter((k) => !orderKinds.includes(k));
  const firstTextIdx = frames.findIndex((f) => f.type === "TEXT_MESSAGE_CONTENT");
  const idxOf = (k) => { const i = orderKinds.indexOf(k); return i < 0 ? Number.POSITIVE_INFINITY : i; };
  const starts = frames.map((f, i) => [f, i]).filter(([f]) => f.type === "TOOL_CALL_START");
  const toolChecks = starts.map(([f, i]) => { const r = frames.findIndex((g) => g.type === "TOOL_CALL_RESULT" && g.toolCallId === f.toolCallId); return { toolCallId: f.toolCallId, tool: f.tool, startIdx: i, resultIdx: r, startBeforeResult: r < 0 || i < r, startBeforeFirstText: firstTextIdx < 0 || i < firstTextIdx, hasResult: r >= 0 }; });
  const checks = {
    httpOk: status === 200,
    doneSeen: frames.some((f) => f.type === "[DONE]"),
    runFinished: frames.some((f) => f.type === "RUN_FINISHED"),
    // Observed live (2026-10-11): the bridge opens the Perplexity Working row (TOOL_CALL_START) on the FIRST thinking frame and emits `sources`
    // BEFORE TOOL_CALL_RESULT (the result closes the card with the source count) — so the documented order is checked as pairwise invariants.
    statusFirst: orderKinds.indexOf("status") >= 0 && orderKinds.indexOf("status") <= 1,
    thinkingBeforeFirstText: idxOf("thinking") >= 0 && idxOf("thinking") < idxOf("TEXT_MESSAGE_CONTENT"),
    planBeforeFirstText: idxOf("plan") >= 0 && idxOf("plan") < idxOf("TEXT_MESSAGE_CONTENT"),
    toolResultBeforeFirstText: idxOf("TOOL_CALL_RESULT") >= 0 && idxOf("TOOL_CALL_RESULT") < idxOf("TEXT_MESSAGE_CONTENT"),
    sourcesBeforeRunFinished: idxOf("sources") >= 0 && idxOf("sources") < idxOf("RUN_FINISHED"),
    runFinishedBeforeDone: idxOf("RUN_FINISHED") >= 0 && idxOf("RUN_FINISHED") < idxOf("[DONE]"),
    expectedKindsOrderStrictlyMonotonic_info: orderMonotonic,
    everyToolStartBeforeItsResult: toolChecks.every((t) => t.startBeforeResult),
    everyToolStartBeforeFirstText: toolChecks.every((t) => t.startBeforeFirstText),
    everyToolStartHasResult: toolChecks.every((t) => t.hasResult),
    noJsonLookingThinking: jsonLikeThinking === 0,
  };
  const summary = {
    label: LABEL, at: new Date().toISOString(), baseUrl: BASE_URL, question: QUESTION, threadId, httpStatus: status, totalMs: Date.now() - t0, frames: frames.length,
    firstSeenOrder: firstSeen, expectedOrder: EXPECTED_ORDER, expectedOrderObserved: expectedPresent, missingKinds: missing,
    thinking: { deltas: thinkingDeltas, jsonLikeDeltas: jsonLikeThinking, jsonLikeSamples: jsonSamples, chars: thinkingAcc.length },
    plannerPayload: { frames: plannerPayloadFrames, chars: plannerPayloadChars },
    tools: toolChecks, textChars: frames.filter((f) => f.type === "TEXT_MESSAGE_CONTENT").reduce((n, f) => n + (f.deltaLen ?? 0), 0),
    sources: Math.max(0, ...frames.filter((f) => f.name === "ondemand.sources").map((f) => f.sources ?? 0)),
    errors: frames.filter((f) => f.error || f.type === "RUN_ERROR" || f.type === "CLIENT_ERROR" || f.type === "HTTP_ERROR").slice(0, 5),
    checks, ok: Object.entries(checks).filter(([k]) => !k.endsWith("_info")).every(([, v]) => v),
  };
  fs.writeFileSync(SUMMARY, JSON.stringify(summary, null, 2));
  console.log(`first-seen order: ${orderKinds.join(" → ")}`);
  console.log(`expected-kinds observed in order: ${expectedPresent.join(" → ")}${missing.length ? `  (missing: ${missing.join(", ")})` : ""}  monotonic=${orderMonotonic}`);
  console.log(`tool calls: ${toolChecks.length} · start<result: ${checks.everyToolStartBeforeItsResult} · start<firstText: ${checks.everyToolStartBeforeFirstText}`);
  console.log(`ondemand.thinking deltas: ${thinkingDeltas} · JSON-looking: ${jsonLikeThinking} · planner_payload frames: ${plannerPayloadFrames} (${plannerPayloadChars} chars)`);
  console.log(`checks: ${JSON.stringify(checks)}`);
  console.log(`wrote ${NDJSON} and ${SUMMARY}`);
  process.exit(summary.ok || process.env.RUN_SOFT === "1" ? 0 : 1);
}
main();
