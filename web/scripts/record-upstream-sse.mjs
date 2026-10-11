#!/usr/bin/env node
// Records the RAW upstream OnDemand SSE stream (ground truth, bypassing the /api/chat bridge).
// Usage: ON_DEMAND_API_KEY=... node web/scripts/record-upstream-sse.mjs <label> "<question>"
// Writes web/proof/stream-audit/upstream-<label>.sse  (one raw SSE line per line, "+<ms> " prefix)
// and    web/proof/stream-audit/upstream-<label>.summary.json (ordered event/eventType/statusType index).
// The API key is read from the environment only — never printed, never written to disk.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.ON_DEMAND_BASE ?? "https://api.on-demand.io";
const KEY = process.env.ON_DEMAND_API_KEY;
if (!KEY) {
  console.error("ON_DEMAND_API_KEY not set");
  process.exit(2);
}
const PLUGIN = "plugin-1722260873";
const ENDPOINT = process.env.ON_DEMAND_ENDPOINT ?? "predefined-deepseek-flash";
const label = process.argv[2] ?? "multistep";
const query =
  process.argv[3] ??
  "Compare the latest news about Fervo Energy and Flutterwave this month, then summarise which has more positive momentum, with cited sources.";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "proof", "stream-audit");
mkdirSync(outDir, { recursive: true });
const ssePath = join(outDir, `upstream-${label}.sse`);
const sumPath = join(outDir, `upstream-${label}.summary.json`);

const headers = { apikey: KEY, "Content-Type": "application/json" };

const sRes = await fetch(`${BASE}/chat/v1/sessions`, {
  method: "POST",
  headers,
  body: JSON.stringify({ externalUserId: "INV-001", pluginIds: [PLUGIN] }),
});
if (!sRes.ok) {
  console.error("session create failed", sRes.status, await sRes.text());
  process.exit(1);
}
const sJson = await sRes.json();
const sessionId = sJson?.data?.id ?? sJson?.id;
console.log("session", sessionId);

const t0 = Date.now();
const qRes = await fetch(`${BASE}/chat/v1/sessions/${sessionId}/query`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    query,
    endpointId: ENDPOINT,
    responseMode: "stream",
    reasoningMode: "medium",
    pluginIds: [PLUGIN],
  }),
});
console.log("query status", qRes.status, qRes.headers.get("content-type"));
if (!qRes.ok || !qRes.body) {
  console.error(await qRes.text());
  process.exit(1);
}

const lines = []; // { ms, line }
const dec = new TextDecoder();
let buf = "";
const reader = qRes.body.getReader();
for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
  let idx;
  while ((idx = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, idx).replace(/\r$/, "");
    buf = buf.slice(idx + 1);
    lines.push({ ms: Date.now() - t0, line });
  }
}
if (buf.length) lines.push({ ms: Date.now() - t0, line: buf });
writeFileSync(ssePath, lines.map((l) => `+${String(l.ms).padStart(6, " ")} ${l.line}`).join("\n") + "\n");

// ---- summary -------------------------------------------------------------
const order = []; // first-seen per (event,eventType,statusType)
const seen = new Map();
const statusCounts = {};
const eventTypeCounts = {};
const summarize = [];
let curEvent = "";
let frames = 0;
let answerChunks = 0;
let answerChars = 0;
for (const { ms, line } of lines) {
  if (line.startsWith("event:")) {
    curEvent = line.slice(6).trim();
    continue;
  }
  if (!line.startsWith("data:")) continue;
  const raw = line.slice(5).trim();
  frames++;
  if (raw === "[DONE]") {
    order.push({ ms, event: curEvent, eventType: "[DONE]", statusType: "" });
    continue;
  }
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    order.push({ ms, event: curEvent, eventType: "<unparseable>", statusType: "", raw: raw.slice(0, 80) });
    continue;
  }
  const eventType = obj.eventType ?? obj.type ?? "";
  const statusType = obj.statusType ?? obj.status ?? "";
  eventTypeCounts[eventType] = (eventTypeCounts[eventType] ?? 0) + 1;
  if (statusType) statusCounts[statusType] = (statusCounts[statusType] ?? 0) + 1;
  if (eventType === "fulfillment" || eventType === "answer") {
    answerChunks++;
    answerChars += String(obj.answer ?? obj.content ?? "").length;
  }
  const key = `${curEvent}|${eventType}|${statusType}`;
  if (!seen.has(key)) {
    seen.set(key, true);
    order.push({ ms, event: curEvent, eventType, statusType, keys: Object.keys(obj) });
  }
  if (/summar/i.test(raw)) {
    summarize.push({ ms, event: curEvent, eventType, statusType, keys: Object.keys(obj), frame: obj });
  }
}
const summary = {
  recordedAt: new Date().toISOString(),
  label,
  endpointId: ENDPOINT,
  pluginIds: [PLUGIN],
  query,
  durationMs: lines.length ? lines[lines.length - 1].ms : 0,
  rawLines: lines.length,
  dataFrames: frames,
  answerChunks,
  answerChars,
  firstSeenOrder: order,
  eventTypeCounts,
  statusTypeCounts: statusCounts,
  summarizeHistoryFrames: {
    initialized: statusCounts["summarize_history.initialized"] ?? 0,
    completed: statusCounts["summarize_history.completed"] ?? 0,
    anyMatchingSummar: summarize.length,
    frames: summarize,
  },
};
writeFileSync(sumPath, JSON.stringify(summary, null, 2) + "\n");
console.log(`wrote ${ssePath} (${lines.length} lines, ${frames} data frames, ${summary.durationMs} ms)`);
console.log("statusTypes:", JSON.stringify(statusCounts));
console.log("summar* frames:", summarize.length);
