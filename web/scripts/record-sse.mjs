#!/usr/bin/env node
// Lane G — SSE recorder. Records two /api/chat runs (report + news) frame-by-frame with relative-ms timestamps and verifies the artifact chain.
// Usage: cd web && QA_LABEL=final BASE_URL=https://<frontend> API_URL=https://<backend> node scripts/record-sse.mjs
// Outputs (web/proof/qa-final/<label>/): sse-report.ndjson, sse-news.ndjson, sse-summary.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = (process.env.BASE_URL ?? "https://sb-7dj6w8wasj6f.vercel.run").replace(/\/$/, "");
const API_URL = (process.env.API_URL ?? "https://sb-51xmkpgnapk5.vercel.run").replace(/\/$/, "");
const LABEL = process.env.QA_LABEL ?? "baseline";
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "proof", "qa-final", LABEL);
fs.mkdirSync(OUT, { recursive: true });
const TOTAL_MS = Number(process.env.SSE_TOTAL_MS) || 300_000;
const PLUGIN_IDS = (process.env.QA_PLUGIN_IDS ?? "plugin-1722260873").split(",").filter(Boolean);

const log = (...a) => console.error(`[record-sse ${new Date().toISOString()}]`, ...a);

/** POST /api/chat and record every SSE frame. Body shape = web/src/app/api/chat/route.ts: {threadId, messages[], context{pluginIds, externalUserId, systemContext?}}. */
async function record(name, question, file, extraCtx = {}) {
  const threadId = `qa-${Date.now()}`;
  const body = { threadId, messages: [{ role: "user", content: question }], context: { pluginIds: PLUGIN_IDS, externalUserId: "INV-001", ...extraCtx } };
  const frames = [];
  const counts = {}; const customCounts = {}; const artifactPhases = [];
  let firstEventMs = null, firstTokenMs = null, doneMs = null, doneSeen = false, runFinishedMs = null, runErrorMs = null, heartbeats = 0, status = 0, headersMs = null;
  let textChars = 0; let sessionId = null; let errorFrame = null; let sourcesCount = 0; let fillerCount = 0;
  const t0 = Date.now();
  const ws = fs.createWriteStream(file);
  const push = (frame) => { frames.push(frame); ws.write(JSON.stringify(frame) + "\n"); };
  const ac = new AbortController(); const killer = setTimeout(() => ac.abort(), TOTAL_MS);
  try {
    const res = await fetch(`${BASE_URL}/api/chat`, { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify(body), signal: ac.signal });
    status = res.status; headersMs = Date.now() - t0;
    log(name, "HTTP", status, "headers at", headersMs, "ms", "content-type", res.headers.get("content-type"), "session", res.headers.get("x-ondemand-session"));
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
          if (!dataLines.length) { if (chunk.trim()) push({ ms, type: "RAW", raw: chunk.slice(0, 300) }); continue; }
          const data = dataLines.join("\n");
          if (firstEventMs == null) firstEventMs = ms;
          if (data === "[DONE]") { doneSeen = true; doneMs = ms; push({ ms, type: "[DONE]" }); continue; }
          let ev; try { ev = JSON.parse(data); } catch { push({ ms, type: "UNPARSED", raw: data.slice(0, 300) }); continue; }
          const type = ev.type ?? "?"; counts[type] = (counts[type] ?? 0) + 1;
          const rec = { ms, type };
          if (type === "CUSTOM") {
            rec.name = ev.name; customCounts[ev.name] = (customCounts[ev.name] ?? 0) + 1;
            if (ev.name === "ondemand.heartbeat") heartbeats++;
            if (ev.name === "ondemand.filler") fillerCount++;
            if (ev.name === "ondemand.session") sessionId = ev.value?.sessionId ?? sessionId;
            if (ev.name === "ondemand.status") rec.phase = ev.value?.phase;
            if (ev.name === "ondemand.sources") { sourcesCount = Math.max(sourcesCount, ev.value?.sources?.length ?? 0); rec.sources = ev.value?.sources?.length ?? 0; }
            if (ev.name === "ondemand.error") { errorFrame = { code: ev.value?.code, message: String(ev.value?.message ?? "").slice(0, 300) }; rec.error = errorFrame; }
            if (ev.name === "ondemand.agent") rec.subtype = ev.value?.subtype;
            if (ev.name === "ondemand.artifact") { rec.phase = ev.value?.phase; rec.artifactName = ev.value?.name; rec.artifactId = ev.value?.artifact?.id ?? null; rec.media = ev.value?.media?.status ?? null; rec.message = ev.value?.message; artifactPhases.push({ ms, phase: ev.value?.phase, name: ev.value?.name, id: ev.value?.artifact?.id ?? null, mediaStatus: ev.value?.media?.status ?? null, message: ev.value?.message ?? null }); }
            if (ev.name === "ondemand.thinking") rec.kind = ev.value?.kind;
          } else if (type === "TEXT_MESSAGE_CONTENT") {
            if (firstTokenMs == null) firstTokenMs = ms;
            textChars += String(ev.delta ?? "").length; rec.deltaLen = String(ev.delta ?? "").length;
          } else if (type === "TOOL_CALL_START") rec.tool = ev.toolCallName;
          else if (type === "TOOL_CALL_RESULT") { rec.isError = !!ev.isError; rec.status = ev.content?.status; }
          else if (type === "RUN_FINISHED") runFinishedMs = ms;
          else if (type === "RUN_ERROR") { runErrorMs = ms; rec.message = String(ev.message ?? "").slice(0, 300); }
          push(rec);
        }
      }
    }
  } catch (e) {
    push({ ms: Date.now() - t0, type: "CLIENT_ERROR", message: String(e?.message ?? e) });
    log(name, "client error", e?.message ?? e);
  } finally { clearTimeout(killer); ws.end(); }
  const totalMs = Date.now() - t0;
  const endMs = doneMs ?? runFinishedMs ?? runErrorMs ?? totalMs;
  const creating = artifactPhases.find((a) => a.phase === "creating"); const ready = artifactPhases.find((a) => a.phase === "ready"); const failed = artifactPhases.find((a) => a.phase === "failed");
  // ordering by FRAME INDEX (ready and [DONE] may share the same ms — the bridge awaits the artifact job and then closes the stream)
  const idxReady = frames.findIndex((f) => f.type === "CUSTOM" && f.name === "ondemand.artifact" && f.phase === "ready");
  const idxDone = frames.findIndex((f) => f.type === "[DONE]"); const idxFinished = frames.findIndex((f) => f.type === "RUN_FINISHED");
  const agentSubtypes = frames.filter((f) => f.type === "CUSTOM" && f.name === "ondemand.agent").map((f) => f.subtype);
  const summary = {
    name, question, threadId, sessionId, httpStatus: status, headersMs,
    firstEventMs, firstTokenMs, runFinishedMs, runErrorMs, doneMs, totalMs, doneSeen,
    frames: frames.length, counts, customCounts, heartbeats, fillerCount, textChars, sourcesCount, error: errorFrame,
    agentSubtypes: [...new Set(agentSubtypes)],
    artifact: {
      phases: artifactPhases,
      creatingMs: creating?.ms ?? null, readyMs: ready?.ms ?? null, failedMs: failed?.ms ?? null,
      readyBeforeDone: idxReady >= 0 && idxDone >= 0 && idxReady < idxDone,
      readyBeforeRunFinished: idxReady >= 0 && idxFinished >= 0 && idxReady < idxFinished,
      frameIndex: { ready: idxReady, runFinished: idxFinished, done: idxDone },
      chain: `file_written/agent→creating@${creating?.ms ?? "n/a"} → ready@${ready?.ms ?? "n/a"} → [DONE]@${doneMs ?? "n/a"}`,
      artifactId: ready?.id ?? null, artifactName: ready?.name ?? creating?.name ?? null, mediaStatus: ready?.mediaStatus ?? null,
    },
    endMs,
  };
  log(name, "done:", JSON.stringify({ firstEventMs, firstTokenMs, totalMs, doneSeen, frames: frames.length, artifactReadyBeforeDone: summary.artifact.readyBeforeDone }));
  return summary;
}

async function verifyArtifacts(reportSummary) {
  const out = { listStatus: null, listed: null, total: null, artifact: null, contentStatus: null, pdfMagic: null, contentBytes: null, signedUrl: { status: null, source: null, url: null, urlStatus: null, note: null }, backendListStatus: null };
  try {
    const r = await fetch(`${BASE_URL}/api/artifacts?limit=50`, { headers: { accept: "application/json" } }); out.listStatus = r.status;
    const j = await r.json(); const data = j.data ?? []; out.total = j.total ?? data.length;
    const byId = reportSummary.artifact.artifactId ? data.find((a) => a.id === reportSummary.artifact.artifactId) : null;
    const art = byId ?? data.find((a) => /-report\.pdf$/i.test(a.name)) ?? data.find((a) => a.mime === "application/pdf" && /report/i.test(a.name));
    out.listed = !!art; out.reportPdfNames = data.filter((a) => /-report\.pdf$/i.test(a.name)).map((a) => a.name).slice(0, 10);
    if (art) {
      out.artifact = { id: art.id, name: art.name, mime: art.mime, sizeBytes: art.sizeBytes, mediaStatus: art.mediaStatus ?? null, mediaId: art.mediaId ?? null, contentUrl: art.contentUrl, originEvent: art.originEvent ?? null };
      const cu = art.contentUrl?.startsWith("http") ? art.contentUrl : `${BASE_URL}${art.contentUrl ?? `/api/artifacts/${art.id}/content`}`;
      const c = await fetch(cu); out.contentStatus = c.status; const b = Buffer.from(await c.arrayBuffer()); out.contentBytes = b.length; out.pdfMagic = b.subarray(0, 4).toString() === "%PDF";
      const s = await fetch(`${BASE_URL}/api/artifacts/${art.id}/signed-url`, { headers: { accept: "application/json" }, redirect: "manual" }).catch(() => null);
      if (!s) out.signedUrl.note = "fetch failed";
      else {
        out.signedUrl.status = s.status;
        if (s.status === 404 || s.status === 405) out.signedUrl.note = "n/a (not in baseline build — Lane C adds /signed-url)";
        else if (s.ok) {
          const sj = await s.json().catch(() => ({})); const d = sj.data ?? sj;
          out.signedUrl.source = d.source ?? null; out.signedUrl.url = d.url ?? d.signedUrl ?? null;
          if (out.signedUrl.url) { const u = out.signedUrl.url.startsWith("http") ? out.signedUrl.url : `${BASE_URL}${out.signedUrl.url}`; const ur = await fetch(u, { method: "GET" }).catch(() => null); out.signedUrl.urlStatus = ur?.status ?? null; }
        } else out.signedUrl.note = `HTTP ${s.status}`;
      }
    }
    const be = await fetch(`${API_URL}/artifacts?limit=5`, { headers: { accept: "application/json" } }).catch(() => null); out.backendListStatus = be?.status ?? null;
  } catch (e) { out.error = String(e?.message ?? e); }
  return out;
}

const started = new Date().toISOString();
const report = await record("report", "Write a short portfolio report on Fervo Energy with cited sources.", path.join(OUT, "sse-report.ndjson"));
const artifacts = await verifyArtifacts(report);
const news = await record("news", "What is the latest news about Fervo Energy? Cite sources.", path.join(OUT, "sse-news.ndjson"));
const summary = {
  label: LABEL, baseUrl: BASE_URL, apiUrl: API_URL, startedUtc: started, finishedUtc: new Date().toISOString(),
  report, news, artifacts,
  checks: {
    reportFirstEventUnder400ms: report.firstEventMs != null && report.firstEventMs <= 400,
    reportDoneSeen: report.doneSeen, newsDoneSeen: news.doneSeen,
    artifactReadyBeforeDone: report.artifact.readyBeforeDone,
    reportPdfListed: artifacts.listed === true, reportPdfContentOk: artifacts.contentStatus === 200 && artifacts.pdfMagic === true,
    signedUrl: artifacts.signedUrl.status === 200 ? `ok (source=${artifacts.signedUrl.source}, url→${artifacts.signedUrl.urlStatus})` : artifacts.signedUrl.note ?? `HTTP ${artifacts.signedUrl.status}`,
    firstTokenMs: { report: report.firstTokenMs, news: news.firstTokenMs },
  },
};
fs.writeFileSync(path.join(OUT, "sse-summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ label: LABEL, report: { firstEventMs: report.firstEventMs, firstTokenMs: report.firstTokenMs, totalMs: report.totalMs, doneSeen: report.doneSeen, heartbeats: report.heartbeats, counts: report.counts, custom: report.customCounts, artifact: report.artifact.chain, readyBeforeDone: report.artifact.readyBeforeDone, error: report.error }, news: { firstEventMs: news.firstEventMs, firstTokenMs: news.firstTokenMs, totalMs: news.totalMs, doneSeen: news.doneSeen, heartbeats: news.heartbeats, counts: news.counts, error: news.error }, artifacts: { listed: artifacts.listed, name: artifacts.artifact?.name, contentStatus: artifacts.contentStatus, pdfMagic: artifacts.pdfMagic, signedUrl: summary.checks.signedUrl } }, null, 2));
