import { NextRequest } from "next/server";
import {
  ONDEMAND_BASE_URL, serverApiKey, ENDPOINT_ID, ENDPOINT_LABEL, REASONING_MODE, RESPONSE_MODE, PLUGIN_ID, PLUGIN_NAME, PLUGIN_IDS,
  DEFAULT_EXTERNAL_USER_ID, UPSTREAM_USER_AGENT, CHAT_FIRST_BYTE_MS, CHAT_TOTAL_MS, CHAT_HEARTBEAT_MS, CHAT_SESSION_HEADER_WAIT_MS, PAYLOAD_AUDIT, PLUGIN_ERROR_RE,
  PLUGIN_NAMES, resolvePluginIds,
} from "@/lib/ondemand/config";
import { parseFrame, type PluginRef, type UiEvent } from "@/lib/ondemand/sse-adapter";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * SSE streaming bridge: OpenUI AgentInterface (@openuidev/react-ui `fetchLLM` + `agUIAdapter`) → OnDemand Chat API.
 *
 *   Browser → POST /api/chat { threadId, messages[], context{ sessionId?, externalUserId?, systemContext?, sessionContext? } }
 *   Server  → HTTP 200 text/event-stream immediately (first frame < 400 ms, before any upstream await), then one AG-UI frame per upstream event.
 *
 * FIXED upstream configuration (no fallback chain, no plugin substitution — ever):
 *   endpointId   = predefined-deepseek-flash   (DeepSeek Flash v4.1)
 *   reasoningMode= medium
 *   responseMode = stream
 *   pluginIds    = ["plugin-1722260873"]       (Perplexity — the only plugin, on the session AND on every query)
 *
 * Client event schema (every frame is `data: <json>\n\n`; terminal `data: [DONE]`):
 *   RUN_STARTED                                             — emitted synchronously on request receipt
 *   CUSTOM ondemand.status   {phase, elapsedMs, …}          — connecting | creating-session | querying | planning | researching | answering | done
 *   CUSTOM ondemand.session  {sessionId, created, viaHeader, endpointId, reasoningMode, pluginIds}
 *   TOOL_CALL_START/ARGS/END {toolCallName: "Perplexity", args {plugin, pluginId, query, endpointId, reasoningMode}}   — plugin start (on the planning frame)
 *   CUSTOM ondemand.thinking {kind: planning|step|fulfillment, delta}                                                  — collapsible reasoning trace
 *   CUSTOM ondemand.sources  {sources[{url,title,sourceName,imageUrl?}], pluginId, pluginName, partial}                 — plugin done + citations (incremental)
 *   TOOL_CALL_RESULT         {content: {status: ok|error, plugin, sources, message?}, isError?: true}                   — plugin done / failed
 *   TEXT_MESSAGE_START / TEXT_MESSAGE_CONTENT {delta} / TEXT_MESSAGE_END                                               — answer deltas, flushed per upstream event
 *   CUSTOM ondemand.metrics  {publicMetrics{inputTokens,outputTokens,totalTokens,ragTimeSec,fulfillmentTimeSec,totalTimeSec}}
 *   CUSTOM ondemand.error    {code, message, raw}            — typed error (HTTP error, `[ERROR]:` frame, eventType error, or the plugin-failure pattern)
 *   RUN_ERROR {message, code}  /  RUN_FINISHED               — then `data: [DONE]`
 *
 * Upstream plugin failure ("Not enough credits" / "error":"Internal server error" / "tool returned an error") is NEVER delivered by OnDemand as an
 * error frame — it only appears inside fulfillment_thinking deltas and in the answer prose. The bridge detects that pattern in every delta,
 * closes the Perplexity tool call with isError:true and streams CUSTOM ondemand.error + RUN_ERROR. It never retries with another plugin.
 *
 * Headers: text/event-stream; no-cache, no-transform; keep-alive; x-accel-buffering: no; content-encoding: identity; x-ondemand-session (when known).
 * The apikey is read from the server env (or an `x-ondemand-key` override header) and is never logged nor sent to the browser.
 * Audit: PAYLOAD_AUDIT (default on) appends {request (key redacted), first 10 raw upstream events, timings} per turn to <cwd>/proof/chat-payload-audit.json.
 */
type InMsg = { role?: string; content?: unknown };
type Ctx = { sessionId?: string; externalUserId?: string; systemContext?: string; sessionContext?: { key: string; value: string }[]; pluginIds?: string[] };
const enc = new TextEncoder();
const frame = (obj: unknown) => enc.encode(`data: ${JSON.stringify(obj)}\n\n`);
const DONE = enc.encode("data: [DONE]\n\n");
const textOf = (c: unknown): string => typeof c === "string" ? c : Array.isArray(c) ? c.map((p) => (p && typeof p === "object" && "text" in p ? String((p as { text: unknown }).text) : "")).join("") : "";
const jsonError = (message: string, status: number) => Response.json({ error: { message } }, { status });
const SSE_HEADERS = (sessionId: string) => ({
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
  "content-encoding": "identity",
  "x-ondemand-model": ENDPOINT_ID,
  ...(sessionId ? { "x-ondemand-session": sessionId } : {}),
});
class UpstreamError extends Error { constructor(message: string, public status: number, public code = "upstream_http") { super(message); this.name = "UpstreamError"; } }
type Src = { url: string; title: string; sourceName: string; imageUrl?: string };

/** Append-only, redacted payload audit (never the apikey; sessionId kept — it is not a secret). Best-effort; failures are swallowed. */
async function appendAudit(entry: Record<string, unknown>) {
  if (!PAYLOAD_AUDIT) return;
  try {
    const [fs, path] = await Promise.all([import("node:fs/promises"), import("node:path")]);
    const dir = path.join(process.cwd(), "proof"); await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, "chat-payload-audit.json");
    let arr: unknown[] = [];
    try { arr = JSON.parse(await fs.readFile(file, "utf8")) as unknown[]; if (!Array.isArray(arr)) arr = []; } catch { arr = []; }
    arr.push(entry); if (arr.length > 40) arr = arr.slice(-40);
    await fs.writeFile(file, JSON.stringify(arr, null, 2));
  } catch { /* audit only */ }
}
const redactHeaders = (h: Record<string, string>) => Object.fromEntries(Object.entries(h).map(([k, v]) => [k, k.toLowerCase() === "apikey" ? "<redacted>" : v]));

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const key = req.headers.get("x-ondemand-key")?.trim() || serverApiKey();
  let body: { threadId?: string; messages?: InMsg[]; context?: Record<string, unknown> } = {};
  try { body = await req.json(); } catch { return jsonError("expected JSON body", 400); }
  const ctx = (body.context ?? {}) as Ctx;
  const msgs = Array.isArray(body.messages) ? body.messages : [];
  const lastUser = [...msgs].reverse().find((m) => m?.role === "user");
  const query = textOf(lastUser?.content).trim();
  if (!query) return jsonError("no user message", 400);
  // Explicit plugin list: pinned Perplexity + exactly the ids the user toggled on (catalogue allow-list). Nothing is ever substituted.
  const { pluginIds, dropped: droppedPluginIds } = resolvePluginIds(ctx.pluginIds ?? PLUGIN_IDS);
  const externalUserId = typeof ctx.externalUserId === "string" && ctx.externalUserId ? ctx.externalUserId.slice(0, 64) : DEFAULT_EXTERNAL_USER_ID;
  const H: Record<string, string> = { apikey: key, "content-type": "application/json", "user-agent": UPSTREAM_USER_AGENT };
  const runId = crypto.randomUUID(); const messageId = crypto.randomUUID(); const threadId = body.threadId ?? crypto.randomUUID();
  const isFirstTurn = msgs.filter((m) => m?.role === "user").length <= 1;
  const audit: Record<string, unknown> = { at: new Date(t0).toISOString(), threadId, runId, endpointId: ENDPOINT_ID, endpointLabel: ENDPOINT_LABEL, reasoningMode: REASONING_MODE, responseMode: RESPONSE_MODE, pluginIds, requestedPluginIds: ctx.pluginIds ?? null, droppedPluginIds };
  const rawFirst: { ms: number; raw: string }[] = []; let rawCount = 0;

  // One AbortController fans in: client disconnect (req.signal) + our own deadlines.
  const ac = new AbortController();
  let abortReason = "";
  const abort = (reason: string) => { if (!ac.signal.aborted) { abortReason = reason; ac.abort(); } };
  if (req.signal.aborted) abort("client");
  req.signal.addEventListener("abort", () => abort("client"), { once: true });
  const totalTimer = setTimeout(() => abort("deadline-total"), CHAT_TOTAL_MS);
  const timeoutMessage = (phase: string) => `OnDemand did not answer within ${Math.round((Date.now() - t0) / 1000)} s (${phase}) — try again`;

  // 1. session — reuse the one the client remembered for this thread; create only when absent.
  let sessionId = typeof ctx.sessionId === "string" && /^[A-Za-z0-9]+$/.test(ctx.sessionId) ? ctx.sessionId : "";
  let sessionPromise: Promise<string> | null = null;
  let sessionCreated = false;
  if (!sessionId && key) {
    const sc = Array.isArray(ctx.sessionContext) ? ctx.sessionContext.slice(0, 8).map((c) => ({ key: String(c.key).slice(0, 64), value: String(c.value).slice(0, 2000) })) : [];
    const createBody = { externalUserId, pluginIds, ...(sc.length ? { contextMetadata: sc } : {}) };
    audit.sessionCreate = { url: `${ONDEMAND_BASE_URL}/chat/v1/sessions`, headers: redactHeaders(H), body: { ...createBody, contextMetadata: sc.map((c) => ({ key: c.key, valueChars: c.value.length })) } };
    sessionPromise = (async () => {
      const r = await fetch(`${ONDEMAND_BASE_URL}/chat/v1/sessions`, { method: "POST", headers: H, body: JSON.stringify(createBody), signal: ac.signal, cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as { message?: string; data?: { id?: string } };
      (audit.sessionCreate as Record<string, unknown>).response = { status: r.status, id: j?.data?.id ?? null, message: j?.message ?? null, elapsedMs: Date.now() - t0 };
      if (!r.ok || !j?.data?.id) throw new UpstreamError(`OnDemand create session failed (HTTP ${r.status}): ${j?.message ?? "no session id"}`, r.status === 401 || r.status === 403 ? 401 : 502, "session_create");
      sessionCreated = true;
      return j.data.id;
    })();
    sessionPromise.catch(() => {}); // handled inside the stream
    if (CHAT_SESSION_HEADER_WAIT_MS > 0) {
      let raceTimer: ReturnType<typeof setTimeout> | undefined;
      const raced = await Promise.race([sessionPromise.then((id) => id, () => ""), new Promise<string>((res) => { raceTimer = setTimeout(() => res(""), CHAT_SESSION_HEADER_WAIT_MS); })]);
      clearTimeout(raceTimer);
      if (raced) { sessionId = raced; sessionPromise = null; }
    }
  }
  const sessionFromHeaderPath = Boolean(sessionId);

  const dec = new TextDecoder();
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (o: unknown) => { if (!closed) { try { controller.enqueue(frame(o)); } catch { closed = true; } } };
      const finish = () => { if (!closed) { try { controller.enqueue(DONE); controller.close(); } catch { /* already closed */ } closed = true; } };
      let gotFirstByte = false, lastSentAt = Date.now();
      let firstByteTimer: ReturnType<typeof setTimeout> | undefined;
      const heartbeat = setInterval(() => {
        if (closed) return;
        send({ type: "CUSTOM", name: "ondemand.heartbeat", value: { t: new Date().toISOString(), elapsedMs: Date.now() - t0, sinceLastFrameMs: Date.now() - lastSentAt } });
      }, CHAT_HEARTBEAT_MS);
      const cleanup = () => { clearInterval(heartbeat); clearTimeout(firstByteTimer); clearTimeout(totalTimer); };
      const status = (phase: string, extra: Record<string, unknown> = {}) => send({ type: "CUSTOM", name: "ondemand.status", value: { phase, elapsedMs: Date.now() - t0, ...extra } });

      // Immediate frames — flushed before any upstream await (first visible event well under 400 ms).
      send({ type: "RUN_STARTED", threadId, runId });
      status("connecting", { endpointId: ENDPOINT_ID, endpointLabel: ENDPOINT_LABEL, reasoningMode: REASONING_MODE, pluginIds, pluginNames: pluginIds.map((id) => PLUGIN_NAMES[id] ?? id), droppedPluginIds, sessionKnown: sessionFromHeaderPath });

      let text = "", textStarted = false, buf = "";
      let firstTokenAt = 0; let firstFrameAt = 0; let stepCounter = 0; let currentStepId = ""; let summaryIndex = 0;
      const realSources = new Map<string, Src>();
      const pluginErr: { current: { message: string; raw: string } | null } = { current: null };
      const startText = () => { if (!textStarted) { textStarted = true; send({ type: "TEXT_MESSAGE_START", messageId, role: "assistant" }); } };
      const custom = (name: string, value: Record<string, unknown>) => { send({ type: "CUSTOM", name, value: { elapsedMs: Date.now() - t0, ...value } }); lastSentAt = Date.now(); };
      // ---- tool cards: one per plugin id (pinned Perplexity opens on the first planning frame; others open when the plan/agents name them)
      type Tool = { id: string; name: string; open: boolean; stepId?: string; startedAt: number };
      const tools = new Map<string, Tool>();
      const pluginName = (id: string) => PLUGIN_NAMES[id] ?? id;
      const toolStart = (pid: string, name?: string, stepId?: string, input?: string) => {
        if (tools.has(pid)) return;
        const id = crypto.randomUUID(); tools.set(pid, { id, name: name || pluginName(pid), open: true, stepId, startedAt: Date.now() });
        const args = { plugin: name || pluginName(pid), pluginId: pid, query: (input || query).slice(0, 300), stepId: stepId ?? currentStepId ?? "", endpointId: ENDPOINT_ID, endpointLabel: ENDPOINT_LABEL, reasoningMode: REASONING_MODE };
        send({ type: "TOOL_CALL_START", toolCallId: id, toolCallName: name || pluginName(pid), parentMessageId: messageId });
        send({ type: "TOOL_CALL_ARGS", toolCallId: id, delta: JSON.stringify(args) });
        send({ type: "TOOL_CALL_END", toolCallId: id });
        status("researching", { plugin: name || pluginName(pid), pluginId: pid, stepId: stepId ?? currentStepId });
        lastSentAt = Date.now();
      };
      const toolDone = (pid: string, st: "ok" | "error", extra: Record<string, unknown> = {}) => {
        if (!tools.has(pid)) toolStart(pid);
        const t = tools.get(pid)!; if (!t.open) return; t.open = false;
        const content = JSON.stringify({ status: st, plugin: t.name, pluginId: pid, durationMs: Date.now() - t.startedAt, sources: realSources.size, ...extra });
        send({ type: "TOOL_CALL_RESULT", messageId: crypto.randomUUID(), toolCallId: t.id, role: "tool", content, ...(st === "error" ? { isError: true, error: String(extra.message ?? "plugin failed") } : {}) });
        lastSentAt = Date.now();
      };
      const allToolsDone = (st: "ok" | "error", extra: Record<string, unknown> = {}) => { for (const pid of tools.keys()) toolDone(pid, st, extra); };
      const refsToIds = (refs: PluginRef[]) => refs.map((r) => (/^plugin-\d+$/.test(r.id) ? r.id : pluginIds.find((id) => pluginName(id).toLowerCase() === r.name.toLowerCase()) ?? r.id));
      const emitSources = (partial: boolean, pid?: string) => custom("ondemand.sources", { messageId, pluginId: pid ?? PLUGIN_ID, pluginName: pluginName(pid ?? PLUGIN_ID), partial, sources: [...realSources.values()].slice(0, 25) });
      const typedError = (code: string, message: string, raw: string) => custom("ondemand.error", { code, message, raw: raw.slice(0, 2000) });
      const detectPluginError = (haystack: string, raw: string) => {
        if (pluginErr.current) return;
        const m = PLUGIN_ERROR_RE.exec(haystack);
        if (!m) return;
        const hit = m[0].replace(/\s+/g, " ").trim();
        const credits = /credits/i.test(hit);
        pluginErr.current = { message: `${PLUGIN_NAME} (${PLUGIN_ID}) returned an upstream error: "${credits ? "Internal server error — Not enough credits" : hit}"${credits ? " (the OnDemand account's Perplexity credits are exhausted)" : ""}. No other plugin was substituted.`, raw };
        typedError("plugin_error", pluginErr.current.message, raw);
        toolDone(PLUGIN_ID, "error", { message: pluginErr.current.message, raw: raw.slice(0, 1200) });
      };
      let thinkingBuf = "";

      /** Translate one typed UI event into AG-UI frames. Returns true on the terminal [DONE]. */
      const dispatch = (u: UiEvent, raw: string): boolean => {
        switch (u.kind) {
          case "done": return true;
          case "heartbeat": return false;
          case "error": throw new UpstreamError(`OnDemand error frame: ${u.message}`, 502, u.code);
          case "metrics": custom("ondemand.metrics", { publicMetrics: u.publicMetrics, firstTokenMs: firstTokenAt ? firstTokenAt - t0 : null, pluginIds }); return false;
          case "plugins_suggested": custom("ondemand.plugins", { phase: u.phase, plugins: u.plugins }); if (u.phase === "initialized") status("planning", { statusType: "plugin_suggestion.initialized", statusMessage: "Finding plugins" }); return false;
          case "plan": custom("ondemand.plan", { objective: u.objective ?? null, steps: u.steps }); status("planning", { statusType: "plan_created", statusMessage: u.objective ?? "Execution plan created", steps: u.steps.length }); return false;
          case "step_start": {
            stepCounter += 1; currentStepId = u.stepId || String(stepCounter);
            custom("ondemand.step", { phase: "start", stepId: currentStepId, index: stepCounter, label: u.label, query: u.query ?? null });
            // Optimistic checkpoint card for every step after the first (filled by summarize_history.completed when the agent emits it).
            if (stepCounter > 1) { summaryIndex = stepCounter - 1; custom("ondemand.summary", { phase: "start", index: summaryIndex, stepId: currentStepId, optimistic: true }); }
            return false;
          }
          case "agents_retrieved": for (const pid of refsToIds(u.plugins)) toolStart(pid, u.plugins.find((p) => p.id === pid)?.name, u.stepId); custom("ondemand.agents", { phase: "retrieved", stepId: u.stepId ?? currentStepId, plugins: u.plugins }); return false;
          case "executing": for (const pid of refsToIds(u.plugins)) toolStart(pid, u.plugins.find((p) => p.id === pid)?.name, u.stepId); custom("ondemand.agents", { phase: "executing", stepId: u.stepId ?? currentStepId, plugins: u.plugins }); status("researching", { statusType: "executing", stepId: u.stepId ?? currentStepId, plugins: u.plugins.length }); return false;
          case "execution_done": {
            const ids = refsToIds(u.plugins); const targets = ids.length ? ids : [...tools.keys()].filter((k) => tools.get(k)!.open);
            for (const pid of targets) { if (u.ok) toolDone(pid, "ok", { message: u.message || undefined }); else { typedError("execution_failed", `${pluginName(pid)}: ${u.message || "execution failed"}`, raw); toolDone(pid, "error", { message: u.message || "execution failed", raw: raw.slice(0, 1200) }); } }
            custom("ondemand.step", { phase: u.ok ? "done" : "failed", stepId: u.stepId ?? currentStepId, index: stepCounter, message: u.message });
            return false;
          }
          case "summary_start": summaryIndex = u.index || summaryIndex || stepCounter; custom("ondemand.summary", { phase: "start", index: summaryIndex, stepId: u.stepId ?? currentStepId, optimistic: false }); return false;
          case "summary_done": custom("ondemand.summary", { phase: "done", index: u.index || summaryIndex || stepCounter, stepId: u.stepId ?? currentStepId, text: u.text, at: new Date().toISOString() }); return false;
          case "thinking": {
            if (u.channel === "planning" || u.channel === "plan" || u.channel === "step" || u.channel === "step_output") toolStart(PLUGIN_ID, PLUGIN_NAME, u.stepId);
            if (u.delta) { custom("ondemand.thinking", { kind: u.channel, delta: u.delta, stepId: u.stepId ?? currentStepId }); thinkingBuf = (thinkingBuf + u.delta).slice(-800); detectPluginError(thinkingBuf, raw); }
            if (u.channel === "step_output" && u.delta) {
              // The step JSON names the plugins it will call: open a card per named plugin as soon as its id appears.
              for (const m of thinkingBuf.matchAll(/"pluginId"\s*:\s*"(plugin-\d+)"/g)) if (pluginIds.includes(m[1])) toolStart(m[1], undefined, u.stepId);
            }
            return false;
          }
          case "sources": {
            for (const c of u.items) if (!realSources.has(c.url)) realSources.set(c.url, c);
            const pid = u.pluginId && pluginIds.includes(u.pluginId) ? u.pluginId : PLUGIN_ID;
            emitSources(true, pid);
            toolDone(pid, "ok", { items: u.items.length });
            status("answering", { sources: realSources.size });
            return false;
          }
          case "answer": {
            if (!firstTokenAt && u.delta) firstTokenAt = Date.now();
            startText(); text += u.delta; send({ type: "TEXT_MESSAGE_CONTENT", messageId, delta: u.delta }); lastSentAt = Date.now();
            detectPluginError(text.slice(-600), raw);
            return false;
          }
          case "answer_complete": custom("ondemand.answer_complete", { chars: u.text.length }); return false;
          case "clarification": custom("ondemand.clarification", { messageId: u.messageId ?? null, queries: u.queries }); status("awaiting-input", { statusType: "clarification_request" }); return false;
          case "require_creds": custom("ondemand.require_creds", { pluginId: u.pluginId ?? null, service: u.service ?? null, fields: u.fields, agent: u.agent ?? null }); status("awaiting-input", { statusType: "require_creds" }); return false;
          case "awaiting_input": custom("ondemand.awaiting_input", { prompt: u.prompt, options: u.options ?? [], agent: u.agent ?? null }); status("awaiting-input", { statusType: "awaiting_input" }); return false;
          case "awaiting_browser_action": custom("ondemand.awaiting_browser_action", { action: u.action ?? null, message: u.message ?? null, url: u.url ?? null, agent: u.agent ?? null }); status("awaiting-input", { statusType: "awaiting_browser_action" }); return false;
          case "filler": custom("ondemand.filler", { on: u.on }); return false;
          case "agent": custom("ondemand.agent", { subtype: u.subtype, agent: u.agent ?? null, data: u.data ?? null }); return false;
          case "status": status(u.statusType === "fulfilling" ? "answering" : "planning", { statusType: u.statusType, statusMessage: u.message, stepQuery: u.stepQuery ?? null }); return false;
          case "unknown": custom("ondemand.unknown", { eventType: u.eventType }); return false;
        }
      };
      const handle = (ev: string, data: string): boolean => dispatch(parseFrame(ev, data), data);

      try {
        // Resolve the session inside the stream when the header fast-path did not win the race.
        if (!key) throw new UpstreamError("No OnDemand key configured: set ONDEMAND_API_KEY on the server (or send x-ondemand-key).", 503, "no_key");
        if (!sessionId) {
          status("creating-session");
          if (!sessionPromise) throw new UpstreamError("session could not be created", 502, "session_create");
          sessionId = await sessionPromise;
        }
        send({ type: "CUSTOM", name: "ondemand.session", value: { sessionId, created: sessionCreated, viaHeader: sessionFromHeaderPath, endpointId: ENDPOINT_ID, endpointLabel: ENDPOINT_LABEL, reasoningMode: REASONING_MODE, pluginIds } });
        audit.sessionId = sessionId; audit.sessionCreated = sessionCreated;
        // 2. query — stream
        status("querying", { sessionId });
        const prefix = isFirstTurn && ctx.systemContext ? `${String(ctx.systemContext).slice(0, 6000)}\n\nQuestion: ` : "";
        const qBody = { query: prefix + query, endpointId: ENDPOINT_ID, responseMode: RESPONSE_MODE, pluginIds, reasoningMode: REASONING_MODE };
        const qUrl = `${ONDEMAND_BASE_URL}/chat/v1/sessions/${sessionId}/query`;
        const qHeaders = { ...H, accept: "text/event-stream" };
        audit.query = { url: qUrl, headers: redactHeaders(qHeaders), body: { ...qBody, query: `${prefix ? `<systemContext ${prefix.length} chars> ` : ""}${query.slice(0, 300)}` } };
        const up = await fetch(qUrl, { method: "POST", headers: qHeaders, body: JSON.stringify(qBody), signal: ac.signal, cache: "no-store" });
        audit.queryResponse = { status: up.status, contentType: up.headers.get("content-type"), elapsedMs: Date.now() - t0 };
        if (!up.ok || !up.body) {
          const rawBody = await up.text().catch(() => "");
          let msg = up.statusText; try { const j = JSON.parse(rawBody) as { message?: string; error?: { message?: string } | string }; msg = j?.message ?? (typeof j?.error === "string" ? j.error : j?.error?.message) ?? msg; } catch { if (rawBody) msg = rawBody.slice(0, 300); }
          typedError("upstream_http", `OnDemand query failed (HTTP ${up.status}): ${msg}`, rawBody.slice(0, 2000));
          throw new UpstreamError(`OnDemand query failed (HTTP ${up.status}): ${msg}`, up.status === 401 || up.status === 403 ? 401 : 502, "upstream_http");
        }
        status("streaming");
        reader = up.body.getReader();
        firstByteTimer = setTimeout(() => { if (!gotFirstByte) abort("deadline-first-byte"); }, CHAT_FIRST_BYTE_MS);
        // 3. translate OnDemand SSE → AG-UI SSE (flushed per upstream frame)
        let upstreamDone = false;
        while (!upstreamDone) {
          const { value, done } = await reader.read(); if (done) break;
          if (!gotFirstByte) { gotFirstByte = true; clearTimeout(firstByteTimer); }
          buf += dec.decode(value, { stream: true });
          let i: number;
          while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
            const m = /\r?\n\r?\n/.exec(buf.slice(i)); const fr = buf.slice(0, i); buf = buf.slice(i + (m ? m[0].length : 2));
            rawCount++; if (rawFirst.length < 10) rawFirst.push({ ms: Date.now() - t0, raw: fr.slice(0, 600) });
            if (!firstFrameAt) { firstFrameAt = Date.now(); status("planning", { firstFrameMs: firstFrameAt - t0 }); }
            let evName = "", data = "";
            for (const line of fr.split(/\r?\n/)) { if (line.startsWith("event:")) evName = line.slice(6).trim(); else if (line.startsWith("data:")) data += line.slice(5).trim(); }
            if (data && handle(evName, data)) { upstreamDone = true; break; }
          }
        }
        if (buf.trim()) { for (const line of buf.split(/\r?\n/)) if (line.startsWith("data:")) handle("", line.slice(5).trim()); }
        startText();
        if (pluginErr.current) {
          // The plugin failed upstream: the model's prose is a disclaimer, not a researched answer. The typed error + red tool card were already
          // streamed; finish the run normally so OpenUI keeps the partial text visible (RUN_ERROR would drop the last debounced delta).
          send({ type: "TEXT_MESSAGE_END", messageId });
          status("done", { chars: text.length, sources: 0, firstTokenMs: firstTokenAt ? firstTokenAt - t0 : null, pluginError: pluginErr.current.message });
          send({ type: "RUN_FINISHED", threadId, runId });
        } else {
          for (const [pid, t] of tools) if (t.open) toolDone(pid, realSources.size || pid !== PLUGIN_ID ? "ok" : "error", realSources.size || pid !== PLUGIN_ID ? {} : { message: "Perplexity returned no sources for this question" });
          send({ type: "TEXT_MESSAGE_END", messageId });
          emitSources(false);
          status("done", { chars: text.length, sources: realSources.size, firstTokenMs: firstTokenAt ? firstTokenAt - t0 : null });
          send({ type: "RUN_FINISHED", threadId, runId });
        }
      } catch (e) {
        const err = e as Error;
        if (abortReason === "client") { closed = true; try { controller.close(); } catch { /* noop */ } }
        else {
          const timedOut = err.name === "AbortError" || abortReason.startsWith("deadline");
          const message = timedOut
            ? timeoutMessage(abortReason === "deadline-first-byte" ? "no first byte" : abortReason === "deadline-total" ? "overall deadline" : reader ? "upstream closed" : "connecting")
            : err instanceof UpstreamError ? err.message : `Upstream fetch failed: ${err.message || "stream failed"}`;
          const code = timedOut ? "timeout" : err instanceof UpstreamError ? err.code : "fetch_failed";
          if (!(err instanceof UpstreamError && err.code === "upstream_http")) typedError(code, message, String(err.message ?? ""));
          allToolsDone("error", { message });
          if (textStarted) send({ type: "TEXT_MESSAGE_END", messageId });
          send({ type: "RUN_ERROR", message, code });
          audit.error = { code, message };
        }
      } finally {
        audit.timings = { firstUpstreamFrameMs: firstFrameAt ? firstFrameAt - t0 : null, firstTokenMs: firstTokenAt ? firstTokenAt - t0 : null, totalMs: Date.now() - t0, upstreamFrames: rawCount, answerChars: text.length, sources: realSources.size, pluginError: pluginErr.current?.message ?? null, abortReason: abortReason || null };
        audit.firstUpstreamEvents = rawFirst;
        void appendAudit(audit);
        cleanup(); reader?.cancel().catch(() => {}); finish();
      }
    },
    cancel() { abort("client"); reader?.cancel().catch(() => {}); clearTimeout(totalTimer); },
  });
  return new Response(stream, { status: 200, headers: SSE_HEADERS(sessionId) });
}
