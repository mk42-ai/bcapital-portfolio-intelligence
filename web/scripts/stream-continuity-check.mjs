#!/usr/bin/env node
// a15 — Streaming-hang + session-continuity regression check (Node 22, no deps).
// Runs TWO consecutive /api/chat turns on the SAME threadId against BASE_URL and asserts:
//   turn 1: reaches [DONE]; no gap >15 s between consecutive frames (heartbeat cadence is 10 s); reports maxGapMs
//   turn 2: body carries both messages + the assistant reply + context.sessionId from turn 1's `ondemand.session` frame;
//           the `ondemand.session` frame reuses the same sessionId (created:false or same id); RUN_FINISHED before [DONE]
//   hang detection: if no frame arrives for 45 s the turn is aborted and reported as hang=true with the last frame kind.
// Usage: cd web && BASE_URL=https://<frontend> node scripts/stream-continuity-check.mjs
// Output: web/proof/pass-3/continuity/report.json (+ turn-1.ndjson, turn-2.ndjson). Exit code 1 when any assertion fails.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = (process.env.BASE_URL ?? "https://sb-1gizcktepfgc.vercel.run").replace(/\/$/, "");
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "proof", "pass-3", "continuity");
fs.mkdirSync(OUT, { recursive: true });
const PLUGIN_IDS = (process.env.QA_PLUGIN_IDS ?? "plugin-1722260873").split(",").filter(Boolean);
const HANG_MS = Number(process.env.HANG_MS) || 45_000; // abort when no frame for this long
const GAP_MAX_MS = Number(process.env.GAP_MAX_MS) || 15_000; // heartbeat cadence 10 s → any gap above this is a regression
const TOTAL_MS = Number(process.env.TOTAL_MS) || 300_000; // hard cap per turn
const Q1 = process.env.Q1 ?? "What is the latest news about Fervo Energy? Cite sources.";
const Q2 = process.env.Q2 ?? "And Flutterwave?";

const log = (...a) => console.error(`[continuity ${new Date().toISOString()}]`, ...a);

/** Human-readable frame kind for reporting (`CUSTOM:ondemand.heartbeat`, `TEXT_MESSAGE_CONTENT`, `[DONE]`, …). */
const kindOf = (f) => (f.type === "CUSTOM" ? `CUSTOM:${f.name}` : f.type);

/** POST /api/chat once; record every SSE frame with relative ms; detect hangs + inter-frame gaps. */
async function runTurn(name, threadId, messages, ctx, file) {
  const body = { threadId, messages, context: { pluginIds: PLUGIN_IDS, externalUserId: "INV-001", ...ctx } };
  const frames = [];
  const counts = {}; const customCounts = {};
  let status = 0, headersMs = null, firstEventMs = null, firstTokenMs = null, doneMs = null, runFinishedMs = null, runErrorMs = null;
  let sessionFrame = null; let errorFrame = null; let textChars = 0; let heartbeats = 0; let text = "";
  let hang = false; let hangAfterMs = null; let clientError = null;
  let maxGapMs = 0; let maxGapAt = null; let gapsOver = [];
  const t0 = Date.now();
  let lastFrameAt = t0;
  const ws = fs.createWriteStream(file);
  const push = (frame) => {
    const now = Date.now();
    const gap = now - lastFrameAt;
    if (frames.length > 0 && gap > maxGapMs) { maxGapMs = gap; maxGapAt = { ms: frame.ms, after: kindOf(frames[frames.length - 1]), before: kindOf(frame) }; }
    if (frames.length > 0 && gap > GAP_MAX_MS) gapsOver.push({ gapMs: gap, after: kindOf(frames[frames.length - 1]), before: kindOf(frame), ms: frame.ms });
    lastFrameAt = now;
    frames.push(frame); ws.write(JSON.stringify(frame) + "\n");
  };
  const ac = new AbortController();
  const hardKill = setTimeout(() => { clientError = `total cap ${TOTAL_MS} ms exceeded`; ac.abort(); }, TOTAL_MS);
  const hangWatch = setInterval(() => {
    const idle = Date.now() - lastFrameAt;
    if (idle >= HANG_MS) { hang = true; hangAfterMs = Date.now() - t0; log(name, `HANG: no frame for ${idle} ms (last frame ${frames.length ? kindOf(frames[frames.length - 1]) : "none"}) — aborting`); ac.abort(); }
  }, 1000);
  try {
    const res = await fetch(`${BASE_URL}/api/chat`, { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify(body), signal: ac.signal });
    status = res.status; headersMs = Date.now() - t0; lastFrameAt = Date.now();
    log(name, "HTTP", status, "headers at", headersMs, "ms; x-ondemand-session", res.headers.get("x-ondemand-session"));
    if (!res.ok || !res.body) {
      const txt = await res.text().catch(() => "");
      push({ ms: Date.now() - t0, type: "HTTP_ERROR", status, body: txt.slice(0, 500) });
    } else {
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
          const ms = Date.now() - t0;
          const dataLines = chunk.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim());
          if (!dataLines.length) { if (chunk.trim()) push({ ms, type: "RAW", raw: chunk.slice(0, 200) }); continue; }
          const data = dataLines.join("\n");
          if (firstEventMs == null) firstEventMs = ms;
          if (data === "[DONE]") { doneMs = ms; push({ ms, type: "[DONE]" }); continue; }
          let ev; try { ev = JSON.parse(data); } catch { push({ ms, type: "UNPARSED", raw: data.slice(0, 200) }); continue; }
          const type = ev.type ?? "?"; counts[type] = (counts[type] ?? 0) + 1;
          const rec = { ms, type };
          if (type === "CUSTOM") {
            rec.name = ev.name; customCounts[ev.name] = (customCounts[ev.name] ?? 0) + 1;
            if (ev.name === "ondemand.heartbeat") heartbeats++;
            if (ev.name === "ondemand.session") { sessionFrame = { sessionId: ev.value?.sessionId ?? null, created: ev.value?.created ?? null, viaHeader: ev.value?.viaHeader ?? null }; rec.session = sessionFrame; }
            if (ev.name === "ondemand.status") rec.phase = ev.value?.phase;
            if (ev.name === "ondemand.error") { errorFrame = { code: ev.value?.code, message: String(ev.value?.message ?? "").slice(0, 300) }; rec.error = errorFrame; }
          } else if (type === "TEXT_MESSAGE_CONTENT") {
            if (firstTokenMs == null) firstTokenMs = ms;
            const d = String(ev.delta ?? ""); textChars += d.length; text += d; rec.deltaLen = d.length;
          } else if (type === "RUN_FINISHED") runFinishedMs = ms;
          else if (type === "RUN_ERROR") { runErrorMs = ms; rec.message = String(ev.message ?? "").slice(0, 300); }
          push(rec);
        }
      }
    }
  } catch (e) {
    if (!hang && !clientError) clientError = String(e?.message ?? e);
    push({ ms: Date.now() - t0, type: hang ? "HANG_ABORT" : "CLIENT_ERROR", message: hang ? `no frame for ${HANG_MS} ms` : clientError });
  } finally { clearTimeout(hardKill); clearInterval(hangWatch); ws.end(); }
  const totalMs = Date.now() - t0;
  const idxDone = frames.findIndex((f) => f.type === "[DONE]"); const idxFinished = frames.findIndex((f) => f.type === "RUN_FINISHED");
  const lastReal = [...frames].reverse().find((f) => f.type !== "HANG_ABORT" && f.type !== "CLIENT_ERROR");
  return {
    name, threadId, httpStatus: status, headersMs, firstEventMs, firstTokenMs, runFinishedMs, runErrorMs, doneMs, totalMs,
    doneSeen: idxDone >= 0, runFinishedBeforeDone: idxFinished >= 0 && idxDone >= 0 && idxFinished < idxDone,
    frames: frames.length, counts, customCounts, heartbeats, textChars, session: sessionFrame, error: errorFrame, clientError,
    hang, hangAfterMs, lastFrameKind: lastReal ? kindOf(lastReal) : null, lastFrameMs: lastReal?.ms ?? null,
    maxGapMs, maxGapAt, gapsOverLimit: gapsOver, text,
  };
}

const startedUtc = new Date().toISOString();
const threadId = `cont-${Date.now()}`;
log("thread", threadId, "base", BASE_URL);
const turn1 = await runTurn("turn-1", threadId, [{ role: "user", content: Q1 }], {}, path.join(OUT, "turn-1.ndjson"));
log("turn-1", JSON.stringify({ doneSeen: turn1.doneSeen, totalMs: turn1.totalMs, maxGapMs: turn1.maxGapMs, hang: turn1.hang, session: turn1.session, heartbeats: turn1.heartbeats, textChars: turn1.textChars }));

const sessionId1 = turn1.session?.sessionId ?? null;
const messages2 = [
  { role: "user", content: Q1 },
  { role: "assistant", content: turn1.text || "(no reply captured)" },
  { role: "user", content: Q2 },
];
const turn2 = await runTurn("turn-2", threadId, messages2, sessionId1 ? { sessionId: sessionId1 } : {}, path.join(OUT, "turn-2.ndjson"));
log("turn-2", JSON.stringify({ doneSeen: turn2.doneSeen, totalMs: turn2.totalMs, maxGapMs: turn2.maxGapMs, hang: turn2.hang, session: turn2.session, heartbeats: turn2.heartbeats, textChars: turn2.textChars }));

const sessionId2 = turn2.session?.sessionId ?? null;
const checks = {
  turn1DoneSeen: turn1.doneSeen,
  turn1NoHang: !turn1.hang,
  turn1MaxGapUnder15s: turn1.maxGapMs <= GAP_MAX_MS,
  turn1SessionFrame: !!sessionId1,
  turn2DoneSeen: turn2.doneSeen,
  turn2NoHang: !turn2.hang,
  turn2MaxGapUnder15s: turn2.maxGapMs <= GAP_MAX_MS,
  turn2SessionReused: !!sessionId1 && sessionId2 === sessionId1 && turn2.session?.created !== true,
  turn2RunFinishedBeforeDone: turn2.runFinishedBeforeDone,
  noErrorFrames: !turn1.error && !turn2.error && turn1.runErrorMs == null && turn2.runErrorMs == null,
};
const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
const strip = ({ text, ...t }) => ({ ...t, textPreview: text.slice(0, 200) });
const report = {
  label: "a15 stream-continuity", baseUrl: BASE_URL, threadId, startedUtc, finishedUtc: new Date().toISOString(),
  thresholds: { gapMaxMs: GAP_MAX_MS, hangMs: HANG_MS, totalMs: TOTAL_MS },
  questions: [Q1, Q2],
  sessionId: { turn1: sessionId1, turn2: sessionId2, reused: checks.turn2SessionReused, turn2Created: turn2.session?.created ?? null },
  wallTimeMs: { turn1: turn1.totalMs, turn2: turn2.totalMs, total: turn1.totalMs + turn2.totalMs },
  maxGapMs: { turn1: turn1.maxGapMs, turn2: turn2.maxGapMs },
  hang: { turn1: turn1.hang, turn2: turn2.hang, lastFrameKind: { turn1: turn1.lastFrameKind, turn2: turn2.lastFrameKind } },
  turn1: strip(turn1), turn2: strip(turn2),
  checks, failed, pass: failed.length === 0,
};
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pass: report.pass, failed, sessionId: report.sessionId, wallTimeMs: report.wallTimeMs, maxGapMs: report.maxGapMs, hang: report.hang, heartbeats: { turn1: turn1.heartbeats, turn2: turn2.heartbeats }, textChars: { turn1: turn1.textChars, turn2: turn2.textChars }, runFinishedBeforeDone: { turn1: turn1.runFinishedBeforeDone, turn2: turn2.runFinishedBeforeDone } }, null, 2));
process.exit(report.pass ? 0 : 1);
