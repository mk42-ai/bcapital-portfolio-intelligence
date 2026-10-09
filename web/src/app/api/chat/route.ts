import { NextRequest } from "next/server";
import { ONDEMAND_BASE_URL, serverApiKey, DEFAULT_ENDPOINT_ID, DEFAULT_EXTERNAL_USER_ID, DEFAULT_PLUGIN_IDS, ALLOWED_PLUGIN_IDS, DEFERRED_PLUGIN_IDS } from "@/lib/ondemand/config";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Chat bridge for the OpenUI AgentInterface (@openuidev/react-ui `fetchLLM` + `agUIAdapter`).
 * Browser → POST /api/chat { threadId, messages[], context{ sessionId?, pluginIds?, endpointId?, externalUserId?, systemContext? } }
 * Server → (1) ensures an OnDemand chat session (POST /chat/v1/sessions), (2) POST /chat/v1/sessions/{id}/query with responseMode "stream",
 *          (3) re-emits the OnDemand SSE as AG-UI events (`data: {...}` frames) so the OpenUI renderer streams text, reasoning and sources.
 * The OnDemand apikey is read from the server env only (or an `x-ondemand-key` override header) and never reaches the browser.
 */
type InMsg = { role?: string; content?: unknown };
const enc = new TextEncoder();
const frame = (obj: unknown) => enc.encode(`data: ${JSON.stringify(obj)}\n\n`);
const textOf = (c: unknown): string => typeof c === "string" ? c : Array.isArray(c) ? c.map((p) => (p && typeof p === "object" && "text" in p ? String((p as { text: unknown }).text) : "")).join("") : "";
const extractUrls = (t: string) => [...new Set((t.match(/https?:\/\/[^\s)\]}>"'`]+/g) ?? []).map((u) => u.replace(/[.,;:!?]+$/, "")))].slice(0, 15);

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-ondemand-key")?.trim() || serverApiKey();
  if (!key) return Response.json({ error: { message: "No OnDemand key configured on the server (ONDEMAND_API_KEY)." } }, { status: 503 });
  let body: { threadId?: string; messages?: InMsg[]; context?: Record<string, unknown> } = {};
  try { body = await req.json(); } catch { return Response.json({ error: { message: "expected JSON body" } }, { status: 400 }); }
  const ctx = (body.context ?? {}) as { sessionId?: string; pluginIds?: string[]; endpointId?: string; externalUserId?: string; systemContext?: string; sessionContext?: { key: string; value: string }[] };
  const msgs = Array.isArray(body.messages) ? body.messages : [];
  const lastUser = [...msgs].reverse().find((m) => m?.role === "user");
  const query = textOf(lastUser?.content).trim();
  if (!query) return Response.json({ error: { message: "no user message" } }, { status: 400 });
  const requested = Array.isArray(ctx.pluginIds) ? ctx.pluginIds : DEFAULT_PLUGIN_IDS;
  const pluginIds = requested.filter((p) => ALLOWED_PLUGIN_IDS.has(p) && !DEFERRED_PLUGIN_IDS.has(p));
  const endpointId = typeof ctx.endpointId === "string" && /^[a-z0-9.-]+$/i.test(ctx.endpointId) ? ctx.endpointId : DEFAULT_ENDPOINT_ID;
  const externalUserId = typeof ctx.externalUserId === "string" && ctx.externalUserId ? ctx.externalUserId.slice(0, 64) : DEFAULT_EXTERNAL_USER_ID;
  const H = { apikey: key, "content-type": "application/json" };
  const runId = crypto.randomUUID(); const messageId = crypto.randomUUID(); const threadId = body.threadId ?? crypto.randomUUID();
  const isFirstTurn = msgs.filter((m) => m?.role === "user").length <= 1;

  // 1. session (reuse the OnDemand session the client remembered for this thread)
  let sessionId = typeof ctx.sessionId === "string" && /^[A-Za-z0-9]+$/.test(ctx.sessionId) ? ctx.sessionId : "";
  if (!sessionId) {
    const sc = Array.isArray(ctx.sessionContext) ? ctx.sessionContext.slice(0, 8).map((c) => ({ key: String(c.key).slice(0, 64), value: String(c.value).slice(0, 2000) })) : [];
    const r = await fetch(`${ONDEMAND_BASE_URL}/chat/v1/sessions`, { method: "POST", headers: H, body: JSON.stringify({ externalUserId, pluginIds, ...(sc.length ? { contextMetadata: sc } : {}) }), signal: req.signal });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return Response.json({ error: { message: `OnDemand create session failed (${r.status}): ${j?.message ?? ""}` } }, { status: 502 });
    sessionId = j?.data?.id;
  }
  // 2. query — stream
  const prefix = isFirstTurn && ctx.systemContext ? `${String(ctx.systemContext).slice(0, 6000)}\n\nQuestion: ` : "";
  const up = await fetch(`${ONDEMAND_BASE_URL}/chat/v1/sessions/${sessionId}/query`, { method: "POST", headers: { ...H, accept: "text/event-stream" }, body: JSON.stringify({ query: prefix + query, endpointId, responseMode: "stream", pluginIds }), signal: req.signal });
  if (!up.ok || !up.body) { const j = await up.json().catch(() => ({})); return Response.json({ error: { message: `OnDemand query failed (${up.status}): ${j?.message ?? ""}` } }, { status: 502 }); }

  // 3. translate OnDemand SSE → AG-UI SSE
  const reader = up.body.getReader(); const dec = new TextDecoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(frame(o));
      send({ type: "RUN_STARTED", threadId, runId });
      send({ type: "CUSTOM", name: "ondemand.session", value: { sessionId, pluginIds, endpointId } });
      let buf = "", text = "", textStarted = false; const toolIds = new Map<string, string>();
      const researchName = `research · ${pluginIds.length ? pluginIds.length + " plugin" + (pluginIds.length > 1 ? "s" : "") : "model only"}`;
      const startText = () => { if (!textStarted) { textStarted = true; send({ type: "TEXT_MESSAGE_START", messageId, role: "assistant" }); } };
      const toolStart = (name: string) => { if (toolIds.has(name)) return; const id = crypto.randomUUID(); toolIds.set(name, id); send({ type: "TOOL_CALL_START", toolCallId: id, toolCallName: name, parentMessageId: messageId }); send({ type: "TOOL_CALL_ARGS", toolCallId: id, delta: "{}" }); send({ type: "TOOL_CALL_END", toolCallId: id }); };
      const toolDone = () => { for (const [, id] of toolIds) send({ type: "TOOL_CALL_RESULT", messageId: crypto.randomUUID(), toolCallId: id, content: "done", role: "tool" }); toolIds.clear(); };
      const handle = (ev: string, data: string) => {
        if (data === "[DONE]") return;
        let j: Record<string, unknown>; try { j = JSON.parse(data); } catch { return; }
        const et = String(j.eventType ?? ev ?? "");
        if (et === "fulfillment" && typeof j.answer === "string") {
          toolDone(); startText(); text += j.answer; send({ type: "TEXT_MESSAGE_CONTENT", messageId, delta: j.answer });
        } else if (et.endsWith("thinking") || et === "step_output" || et === "planning_output") {
          toolStart(researchName); // planning / plugin research phase — shown as a tool activity until the answer starts
        } else if (/agent|plugin|tool/i.test(et)) {
          const name = String((j as { pluginId?: string }).pluginId ?? (j as { agentId?: string }).agentId ?? et); toolStart(name);
        }
      };
      try {
        for (;;) {
          const { value, done } = await reader.read(); if (done) break;
          buf += dec.decode(value, { stream: true });
          let i; while ((i = buf.indexOf("\n\n")) >= 0) {
            const fr = buf.slice(0, i); buf = buf.slice(i + 2); let ev = "", data = "";
            for (const line of fr.split("\n")) { if (line.startsWith("event:")) ev = line.slice(6).trim(); else if (line.startsWith("data:")) data += line.slice(5).trim(); }
            if (data) handle(ev, data);
          }
        }
        toolDone(); startText();
        send({ type: "TEXT_MESSAGE_END", messageId });
        const sources = extractUrls(text).map((u) => { let host = u; try { host = new URL(u).hostname.replace(/^www\./, ""); } catch {} return { url: u, title: host, sourceName: host }; });
        send({ type: "CUSTOM", name: "ondemand.sources", value: { messageId, sources, pluginIds } });
        send({ type: "RUN_FINISHED", threadId, runId });
      } catch (e) {
        send({ type: "RUN_ERROR", message: (e as Error).name === "AbortError" ? "stopped" : (e as Error).message });
      } finally { controller.close(); }
    },
    cancel() { reader.cancel().catch(() => {}); },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no", "x-ondemand-session": sessionId } });
}
