import { NextRequest } from "next/server";
import {
  ONDEMAND_BASE_URL, serverApiKey, DEFAULT_ENDPOINT_ID, DEFAULT_EXTERNAL_USER_ID, DEFAULT_PLUGIN_IDS, ALLOWED_PLUGIN_IDS, DEFERRED_PLUGIN_IDS,
  pluginName, CHAT_FIRST_BYTE_MS, CHAT_TOTAL_MS, CHAT_HEARTBEAT_MS,
} from "@/lib/ondemand/config";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * True SSE streaming bridge: OpenUI AgentInterface (@openuidev/react-ui `fetchLLM` + `agUIAdapter`) → OnDemand Chat API.
 * Browser → POST /api/chat { threadId, messages[], context{ sessionId?, pluginIds?, endpointId?, externalUserId?, systemContext?, sessionContext? } }
 * Server → (1) reuses the OnDemand session from context.sessionId or creates one (POST /chat/v1/sessions),
 *          (2) POST /chat/v1/sessions/{id}/query with responseMode "stream" (pluginIds default = Perplexity ONLY),
 *          (3) re-emits every upstream SSE frame as AG-UI events, flushed per frame, with:
 *              • a 10 s heartbeat (CUSTOM ondemand.heartbeat) so proxies never idle-close,
 *              • a 90 s first-byte and a 240 s overall deadline → RUN_ERROR (never a silent hang),
 *              • req.signal propagated to both upstream fetches (client stop → upstream aborted, stream closed cleanly),
 *              • a real tool card (toolCallName = plugin name, args = the actual query JSON — never "{}").
 * Headers: text/event-stream, no-cache/no-transform, keep-alive, x-accel-buffering: no, content-encoding: identity, x-ondemand-session.
 * The OnDemand apikey is read from the server env (or an `x-ondemand-key` override header) and is never logged nor sent to the browser.
 */
type InMsg = { role?: string; content?: unknown };
type Ctx = { sessionId?: string; pluginIds?: string[]; endpointId?: string; externalUserId?: string; systemContext?: string; sessionContext?: { key: string; value: string }[] };
const enc = new TextEncoder();
const frame = (obj: unknown) => enc.encode(`data: ${JSON.stringify(obj)}\n\n`);
const DONE = enc.encode("data: [DONE]\n\n");
const textOf = (c: unknown): string => typeof c === "string" ? c : Array.isArray(c) ? c.map((p) => (p && typeof p === "object" && "text" in p ? String((p as { text: unknown }).text) : "")).join("") : "";
const extractUrls = (t: string) => [...new Set((t.match(/https?:\/\/[^\s)\]}>"'`]+/g) ?? []).map((u) => u.replace(/[.,;:!?]+$/, "")))].slice(0, 15);
const jsonError = (message: string, status: number) => Response.json({ error: { message } }, { status });
const SSE_HEADERS = (sessionId: string) => ({
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
  "content-encoding": "identity",
  "x-ondemand-session": sessionId,
});

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-ondemand-key")?.trim() || serverApiKey();
  if (!key) return jsonError("No OnDemand key configured on the server (ONDEMAND_API_KEY).", 503);
  let body: { threadId?: string; messages?: InMsg[]; context?: Record<string, unknown> } = {};
  try { body = await req.json(); } catch { return jsonError("expected JSON body", 400); }
  const ctx = (body.context ?? {}) as Ctx;
  const msgs = Array.isArray(body.messages) ? body.messages : [];
  const lastUser = [...msgs].reverse().find((m) => m?.role === "user");
  const query = textOf(lastUser?.content).trim();
  if (!query) return jsonError("no user message", 400);
  const requested = Array.isArray(ctx.pluginIds) ? ctx.pluginIds.map(String) : DEFAULT_PLUGIN_IDS;
  const pluginIds = [...new Set(requested.filter((p) => ALLOWED_PLUGIN_IDS.has(p) && !DEFERRED_PLUGIN_IDS.has(p)))];
  const endpointId = typeof ctx.endpointId === "string" && /^[a-z0-9.-]+$/i.test(ctx.endpointId) ? ctx.endpointId : DEFAULT_ENDPOINT_ID;
  const externalUserId = typeof ctx.externalUserId === "string" && ctx.externalUserId ? ctx.externalUserId.slice(0, 64) : DEFAULT_EXTERNAL_USER_ID;
  const H = { apikey: key, "content-type": "application/json" };
  const runId = crypto.randomUUID(); const messageId = crypto.randomUUID(); const threadId = body.threadId ?? crypto.randomUUID();
  const isFirstTurn = msgs.filter((m) => m?.role === "user").length <= 1;

  // One AbortController fans in: client disconnect (req.signal) + our own deadlines.
  const ac = new AbortController();
  let abortReason = "";
  const abort = (reason: string) => { if (!ac.signal.aborted) { abortReason = reason; ac.abort(); } };
  if (req.signal.aborted) abort("client");
  req.signal.addEventListener("abort", () => abort("client"), { once: true });
  const startedAt = Date.now();
  const totalTimer = setTimeout(() => abort("deadline-total"), CHAT_TOTAL_MS);
  const timeoutMessage = (phase: string) => `OnDemand did not answer within ${Math.round((Date.now() - startedAt) / 1000)} s (${phase}) — try again or disable extra plugins`;

  // 1. session — reuse the one the client remembered for this thread; create only when absent.
  let sessionId = typeof ctx.sessionId === "string" && /^[A-Za-z0-9]+$/.test(ctx.sessionId) ? ctx.sessionId : "";
  let up: Response;
  try {
    if (!sessionId) {
      const sc = Array.isArray(ctx.sessionContext) ? ctx.sessionContext.slice(0, 8).map((c) => ({ key: String(c.key).slice(0, 64), value: String(c.value).slice(0, 2000) })) : [];
      const r = await fetch(`${ONDEMAND_BASE_URL}/chat/v1/sessions`, { method: "POST", headers: H, body: JSON.stringify({ externalUserId, pluginIds, ...(sc.length ? { contextMetadata: sc } : {}) }), signal: ac.signal, cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as { message?: string; data?: { id?: string } };
      if (!r.ok || !j?.data?.id) { clearTimeout(totalTimer); return jsonError(`OnDemand create session failed (${r.status}): ${j?.message ?? "no session id"}`, 502); }
      sessionId = j.data.id;
    }
    // 2. query — stream
    const prefix = isFirstTurn && ctx.systemContext ? `${String(ctx.systemContext).slice(0, 6000)}\n\nQuestion: ` : "";
    up = await fetch(`${ONDEMAND_BASE_URL}/chat/v1/sessions/${sessionId}/query`, {
      method: "POST", headers: { ...H, accept: "text/event-stream" }, body: JSON.stringify({ query: prefix + query, endpointId, responseMode: "stream", pluginIds }), signal: ac.signal, cache: "no-store",
    });
    if (!up.ok || !up.body) {
      const j = (await up.json().catch(() => ({}))) as { message?: string; error?: { message?: string } };
      clearTimeout(totalTimer);
      return jsonError(`OnDemand query failed (${up.status}): ${j?.message ?? j?.error?.message ?? up.statusText}`, up.status === 401 || up.status === 403 ? 401 : 502);
    }
  } catch (e) {
    clearTimeout(totalTimer);
    const err = e as Error;
    if (err.name === "AbortError") return abortReason === "client" ? new Response(null, { status: 499 }) : jsonError(timeoutMessage("connecting"), 504);
    return jsonError(`Upstream fetch failed: ${err.message}`, 502);
  }

  // 3. translate OnDemand SSE → AG-UI SSE (flushed per upstream frame)
  const reader = up.body.getReader(); const dec = new TextDecoder();
  const primaryId = pluginIds[0] ?? ""; const primaryName = primaryId ? pluginName(primaryId) : "";
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (o: unknown) => { if (!closed) { try { controller.enqueue(frame(o)); } catch { closed = true; } } };
      const finish = () => { if (!closed) { try { controller.enqueue(DONE); controller.close(); } catch { /* already closed */ } closed = true; } };
      let gotFirstByte = false, lastSentAt = Date.now();
      const firstByteTimer = setTimeout(() => { if (!gotFirstByte) abort("deadline-first-byte"); }, CHAT_FIRST_BYTE_MS);
      const heartbeat = setInterval(() => {
        if (closed) return;
        send({ type: "CUSTOM", name: "ondemand.heartbeat", value: { t: new Date().toISOString(), elapsedMs: Date.now() - startedAt, sinceLastFrameMs: Date.now() - lastSentAt } });
      }, CHAT_HEARTBEAT_MS);
      const cleanup = () => { clearInterval(heartbeat); clearTimeout(firstByteTimer); clearTimeout(totalTimer); };

      send({ type: "RUN_STARTED", threadId, runId });
      send({ type: "CUSTOM", name: "ondemand.session", value: { sessionId, pluginIds, endpointId } });
      let text = "", textStarted = false, buf = "";
      const tools = new Map<string, { id: string; name: string; open: boolean }>(); // key = pluginId (or derived name)
      // Real citations: OnDemand emits `eventType:"plugin_sources"` frames ({sources:{pluginId,pluginName,items:[{title,url,domain}]}}) before the answer.
      type Src = { url: string; title: string; sourceName: string };
      const realSources = new Map<string, Src>();
      const collectSources = (j: Record<string, unknown>) => {
        const s = j.sources as { pluginId?: string; pluginName?: string; items?: { title?: string; url?: string; domain?: string }[] } | undefined;
        if (!s || !Array.isArray(s.items)) return;
        for (const it of s.items) {
          if (!it?.url || realSources.has(it.url)) continue;
          let host = it.domain || ""; if (!host) { try { host = new URL(it.url).hostname.replace(/^www\./, ""); } catch { host = it.url; } }
          realSources.set(it.url, { url: it.url, title: (it.title || host).slice(0, 160), sourceName: host });
        }
        if (s.pluginId && !tools.has(s.pluginId)) toolStart(s.pluginId, s.pluginName || pluginName(s.pluginId));
      };
      const startText = () => { if (!textStarted) { textStarted = true; send({ type: "TEXT_MESSAGE_START", messageId, role: "assistant" }); } };
      const toolStart = (pid: string, name: string) => {
        if (tools.has(pid)) return;
        const id = crypto.randomUUID(); tools.set(pid, { id, name, open: true });
        const args = { plugin: name, pluginId: pid, query: query.slice(0, 300), endpointId };
        send({ type: "TOOL_CALL_START", toolCallId: id, toolCallName: name, parentMessageId: messageId });
        send({ type: "TOOL_CALL_ARGS", toolCallId: id, delta: JSON.stringify(args) });
        send({ type: "TOOL_CALL_END", toolCallId: id });
        lastSentAt = Date.now();
      };
      const toolsDone = (status: string, extra: Record<string, unknown> = {}) => {
        for (const t of tools.values()) {
          if (!t.open) continue; t.open = false;
          send({ type: "TOOL_CALL_RESULT", messageId: crypto.randomUUID(), toolCallId: t.id, role: "tool", content: JSON.stringify({ status, plugin: t.name, ...extra }) });
        }
      };
      // The plugin research card goes up immediately so the user sees which plugin is running (with its real input).
      if (primaryId) toolStart(primaryId, primaryName);

      const handle = (ev: string, data: string): boolean => {
        if (data === "[DONE]") return true;
        let j: Record<string, unknown>; try { j = JSON.parse(data) as Record<string, unknown>; } catch { return false; }
        const et = String(j.eventType ?? ev ?? "");
        if (et === "heartbeat" || ev === "heartbeat" || et === "metricsLog") return false;
        if (et === "plugin_sources") { collectSources(j); lastSentAt = Date.now(); return false; }
        if (et === "fulfillment" && typeof j.answer === "string") {
          startText(); text += j.answer; send({ type: "TEXT_MESSAGE_CONTENT", messageId, delta: j.answer }); lastSentAt = Date.now();
        } else if (et === "error" || typeof j.error === "string" || (typeof j.message === "string" && typeof j.errorCode === "string")) {
          throw new Error(String((j.error as string) ?? j.message ?? "OnDemand reported an error"));
        } else if (et.endsWith("thinking") || et === "step_output" || et === "planning_output") {
          if (primaryId) toolStart(primaryId, primaryName); // planning / plugin research phase — card stays "running"; no spam
        } else {
          const pid = typeof j.pluginId === "string" ? j.pluginId : typeof j.agentId === "string" ? j.agentId : "";
          const tname = typeof j.toolName === "string" ? j.toolName : typeof j.tool === "string" ? j.tool : "";
          if (pid || tname || /agent|plugin|tool/i.test(et)) { const k = pid || tname || et; toolStart(k, pid ? pluginName(pid) : tname || et); }
        }
        return false;
      };

      try {
        let upstreamDone = false;
        while (!upstreamDone) {
          const { value, done } = await reader.read(); if (done) break;
          if (!gotFirstByte) { gotFirstByte = true; clearTimeout(firstByteTimer); }
          buf += dec.decode(value, { stream: true });
          let i: number;
          while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
            const m = /\r?\n\r?\n/.exec(buf.slice(i)); const fr = buf.slice(0, i); buf = buf.slice(i + (m ? m[0].length : 2));
            let evName = "", data = "";
            for (const line of fr.split(/\r?\n/)) { if (line.startsWith("event:")) evName = line.slice(6).trim(); else if (line.startsWith("data:")) data += line.slice(5).trim(); }
            if (data && handle(evName, data)) { upstreamDone = true; break; }
          }
        }
        if (buf.trim()) { for (const line of buf.split(/\r?\n/)) if (line.startsWith("data:")) handle("", line.slice(5).trim()); }
        startText();
        const fromText = extractUrls(text).map((u) => { let host = u; try { host = new URL(u).hostname.replace(/^www\./, ""); } catch { /* keep raw */ } return { url: u, title: host, sourceName: host }; });
        for (const f of fromText) if (!realSources.has(f.url)) realSources.set(f.url, f);
        const sources = [...realSources.values()].slice(0, 15);
        toolsDone("ok", { sources: sources.length, chars: text.length });
        send({ type: "TEXT_MESSAGE_END", messageId });
        send({ type: "CUSTOM", name: "ondemand.sources", value: { messageId, sources, pluginIds } });
        send({ type: "RUN_FINISHED", threadId, runId });
      } catch (e) {
        const err = e as Error;
        if (abortReason === "client") { closed = true; try { controller.close(); } catch { /* noop */ } }
        else {
          const message = err.name === "AbortError" || abortReason.startsWith("deadline") ? timeoutMessage(abortReason === "deadline-first-byte" ? "no first byte" : abortReason === "deadline-total" ? "overall deadline" : "upstream closed") : err.message || "stream failed";
          toolsDone("error", { message });
          if (textStarted) send({ type: "TEXT_MESSAGE_END", messageId });
          send({ type: "RUN_ERROR", message });
        }
      } finally {
        cleanup(); reader.cancel().catch(() => {}); finish();
      }
    },
    cancel() { abort("client"); reader.cancel().catch(() => {}); clearTimeout(totalTimer); },
  });
  return new Response(stream, { status: 200, headers: SSE_HEADERS(sessionId) });
}
