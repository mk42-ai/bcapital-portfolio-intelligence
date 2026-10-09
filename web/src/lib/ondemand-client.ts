"use client";
/** Browser-side client for the OnDemand Chat API, always via our same-origin proxy (/api/ondemand/*) with the user's key in x-ondemand-key.
 *  SSE wire format observed live on 2026-10-09: `event:heartbeat|thinking|...` + `data:{...}` frames; fulfillment deltas arrive as
 *  data:{"answer":"…","eventType":"fulfillment"}; planning/step events carry thinking.delta / output.delta; terminal frame is `data:[DONE]`. */
export type MessagePart =
  | { type: "text"; text: string }
  | { type: "source-url"; url: string; title?: string }
  | { type: "tool-invocation"; toolName: string; state: "running" | "done"; detail?: string }
  | { type: "reasoning"; text: string };
export type ChatMessage = { id: string; role: "user" | "assistant"; parts: MessagePart[]; createdAt: string; status?: "submitted" | "streaming" | "ready" | "error"; error?: string; messageId?: string };
export type Status = "ready" | "submitted" | "streaming" | "error";
const H = (key: string) => ({ "x-ondemand-key": key, "content-type": "application/json" });

export async function createSession(key: string, externalUserId: string, pluginIds: string[], contextMetadata: { key: string; value: string }[]) {
  const r = await fetch("/api/ondemand/chat/v1/sessions", { method: "POST", headers: H(key), body: JSON.stringify({ externalUserId, pluginIds, contextMetadata }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message ?? `Create session failed (${r.status})`);
  return (j.data?.id ?? j.id) as string;
}
export async function listSessions(key: string, externalUserId: string) {
  const r = await fetch(`/api/ondemand/chat/v1/sessions?externalUserId=${encodeURIComponent(externalUserId)}&limit=20&sort=desc`, { headers: H(key) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.message ?? `HTTP ${r.status}`);
  return (j.data ?? []) as { id: string; title?: string; createdAt: string; pluginIds?: string[] }[];
}
export async function listMessages(key: string, sessionId: string) {
  const r = await fetch(`/api/ondemand/chat/v1/sessions/${sessionId}/messages?limit=50&sort=asc`, { headers: H(key) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.message ?? `HTTP ${r.status}`);
  return (j.data ?? []) as { id: string; query: string; answer: string; createdAt: string; status: string; pluginIds?: string[] }[];
}
export function extractUrls(text: string): string[] { return [...new Set((text.match(/https?:\/\/[^\s)\]}>"'`]+/g) ?? []).map((u) => u.replace(/[.,;:!?]+$/, "")))].slice(0, 12); }

/** Streams one query. onPart receives incremental updates; returns the final assistant message. Honors AbortSignal end-to-end (proxy forwards req.signal). */
export async function streamQuery(opts: { key: string; sessionId: string; query: string; endpointId: string; pluginIds: string[]; signal: AbortSignal; onUpdate: (m: ChatMessage) => void; pluginNames: Record<string, string> }) {
  const msg: ChatMessage = { id: `a-${Date.now()}`, role: "assistant", parts: [], createdAt: new Date().toISOString(), status: "submitted" };
  const emit = () => opts.onUpdate({ ...msg, parts: [...msg.parts] });
  emit();
  const r = await fetch(`/api/ondemand/chat/v1/sessions/${opts.sessionId}/query`, { method: "POST", headers: { ...H(opts.key), accept: "text/event-stream" }, signal: opts.signal, body: JSON.stringify({ query: opts.query, endpointId: opts.endpointId, responseMode: "stream", pluginIds: opts.pluginIds }) });
  if (!r.ok || !r.body) { const j = await r.json().catch(() => ({})); throw new Error(j.message ?? `Query failed (${r.status})`); }
  const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = "", text = "", reasoning = "", gotFirst = false;
  const textPart = (): MessagePart => { let p = msg.parts.find((x) => x.type === "text"); if (!p) { p = { type: "text", text: "" }; msg.parts.push(p); } return p; };
  const toolIdx = new Map<string, number>();
  const tool = (name: string, state: "running" | "done", detail?: string) => { const i = toolIdx.get(name); if (i == null) { toolIdx.set(name, msg.parts.length); msg.parts.push({ type: "tool-invocation", toolName: name, state, detail }); } else { const p = msg.parts[i] as Extract<MessagePart, { type: "tool-invocation" }>; p.state = state; if (detail) p.detail = detail; } };
  const handle = (ev: string, data: string) => {
    if (data === "[DONE]") return;
    let j: Record<string, unknown>; try { j = JSON.parse(data); } catch { return; }
    if (j.messageId && !msg.messageId) msg.messageId = String(j.messageId);
    const et = String(j.eventType ?? ev ?? "");
    if (et === "fulfillment" || (typeof j.answer === "string" && !et.startsWith("planning") && !et.startsWith("step"))) {
      if (typeof j.answer === "string") { text += j.answer; (textPart() as { text: string }).text = text; if (!gotFirst) { gotFirst = true; msg.status = "streaming"; } }
    } else if (et.endsWith("thinking")) { const d = (j.thinking as { delta?: string })?.delta ?? ""; reasoning += d; const rp = msg.parts.find((p) => p.type === "reasoning") as { text: string } | undefined; if (rp) rp.text = reasoning; else msg.parts.unshift({ type: "reasoning", text: reasoning }); msg.status = "streaming"; }
    else if (et === "planning_output" || et === "step_output") { if (j.stepId) tool(`step ${j.stepId}`, "running"); }
    else if (/agent|plugin|tool/i.test(et)) { const name = String((j as { pluginId?: string; agentId?: string; name?: string }).pluginId ?? (j as { agentId?: string }).agentId ?? (j as { name?: string }).name ?? et); tool(opts.pluginNames[name] ?? name, /complet|done|finish/i.test(et) ? "done" : "running", et); }
    else if (et.includes("completed")) { for (const [k] of toolIdx) tool(k, "done"); }
    emit();
  };
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf("\n\n")) >= 0) {
        const frame = buf.slice(0, i); buf = buf.slice(i + 2);
        let ev = "", data = "";
        for (const line of frame.split("\n")) { if (line.startsWith("event:")) ev = line.slice(6).trim(); else if (line.startsWith("data:")) data += line.slice(5).trim(); }
        if (data) handle(ev, data);
      }
    }
  } catch (e) { if ((e as Error).name === "AbortError") { msg.status = "ready"; msg.error = "stopped"; emit(); return msg; } throw e; }
  for (const [k] of toolIdx) tool(k, "done");
  // Inline URL citations → source-url parts (rendered as chips)
  for (const u of extractUrls(text)) msg.parts.push({ type: "source-url", url: u });
  msg.status = "ready"; emit(); return msg;
}

/** Deterministic mock stream used only when no apikey is configured (also drives CI e2e). Never contacts OnDemand. */
export async function mockStream(opts: { query: string; signal: AbortSignal; onUpdate: (m: ChatMessage) => void; companies: string[] }) {
  const msg: ChatMessage = { id: `a-${Date.now()}`, role: "assistant", parts: [{ type: "tool-invocation", toolName: "Portfolio snapshot", state: "running" }], createdAt: new Date().toISOString(), status: "submitted" };
  const emit = () => opts.onUpdate({ ...msg, parts: msg.parts.map((p) => ({ ...p })) }); emit();
  const body = `**Mock mode** — no OnDemand apikey is set, so this answer is generated locally from the portfolio snapshot (no model call). You asked: "${opts.query}". Context companies: ${opts.companies.join(", ") || "none"}. Add your apikey in Settings to stream real answers from ${"predefined-claude-fable-5.1"} with Perplexity and GPT Search. Source: https://sb-4wdkkmzv7w2z.vercel.run/sentiment/portfolio`;
  (msg.parts[0] as { state: string }).state = "done"; msg.parts.push({ type: "text", text: "" }); msg.status = "streaming";
  for (const tok of body.split(/(?<=\s)/)) { if (opts.signal.aborted) { msg.status = "ready"; msg.error = "stopped"; emit(); return msg; } (msg.parts[1] as { text: string }).text += tok; emit(); await new Promise((r) => setTimeout(r, 45)); }
  msg.parts.push({ type: "source-url", url: "https://sb-4wdkkmzv7w2z.vercel.run/sentiment/portfolio", title: "portfolio sentiment" }); msg.status = "ready"; emit(); return msg;
}
