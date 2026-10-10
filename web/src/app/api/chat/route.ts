import { NextRequest } from "next/server";
import { getText as attachmentText } from "@/lib/media/store";
import {
  ONDEMAND_BASE_URL, serverApiKey, ENDPOINT_ID, ENDPOINT_LABEL, REASONING_MODE, RESPONSE_MODE, PLUGIN_ID, PLUGIN_NAME, PLUGIN_IDS,
  DEFAULT_EXTERNAL_USER_ID, UPSTREAM_USER_AGENT, CHAT_FIRST_BYTE_MS, CHAT_TOTAL_MS, CHAT_HEARTBEAT_MS, CHAT_SESSION_HEADER_WAIT_MS, PAYLOAD_AUDIT, PLUGIN_ERROR_RE,
  PLUGIN_NAMES, resolvePluginIds,
} from "@/lib/ondemand/config";
import { parseFrame, type PluginRef, type UiEvent } from "@/lib/ondemand/sse-adapter";
import { CLIENT_EVENT as CE } from "@/lib/ondemand/eventMap";
import { markPluginBlocked, markPluginInvoked, clearPluginBlocked } from "@/lib/plugin-catalogue";
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
type Ctx = { sessionId?: string; externalUserId?: string; systemContext?: string; sessionContext?: { key: string; value: string }[]; pluginIds?: string[]; attachments?: { mediaId: string; name?: string; kind?: string; extractedChars?: number }[] };
/** Per-attachment grounding cap (chars of extracted text prepended to the query). */
const ATTACHMENT_TEXT_CHARS = 12_000;
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
  // Attachments (chat uploads): the browser sends context.attachments[{mediaId,…}] after POST /api/media; the extracted text lives server-side
  // (globalThis media store, 2 h TTL) and is prepended to the query — the documented Submit Query body has no media field (docs/ONDEMAND_CONTRACTS.md).
  const attachmentsIn = Array.isArray(ctx.attachments) ? ctx.attachments.filter((a) => a && typeof a.mediaId === "string" && /^[A-Za-z0-9_-]{6,64}$/.test(a.mediaId)).slice(0, 6) : [];
  const attachments = attachmentsIn.map((a) => { const t = attachmentText(a.mediaId); return { mediaId: a.mediaId, name: String(t?.name ?? a.name ?? "attachment").slice(0, 180), kind: String(t?.kind ?? a.kind ?? "document"), extractedChars: t?.text.length ?? 0, known: !!t, text: t?.text.slice(0, ATTACHMENT_TEXT_CHARS) ?? "" }; });
  const attachmentPrefix = attachments.length
    ? `${attachments.map((a) => `Attached document "${a.name}" (OnDemand media ${a.mediaId}):\n${a.text || "(no text could be extracted from this file; it was uploaded to this OnDemand session as media " + a.mediaId + ")"}`).join("\n\n---\n\n")}\n\nAnswer from the attached document when it is relevant and cite it as ${attachments.map((a) => `[attachment: ${a.name}]`).join(" / ")}.\n\n`
    : "";
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
      let closed = false; let seq = 0;
      // Every frame carries a monotonically increasing `seq` (+ runId): the client tee drops any duplicate and the recorder can prove no frame
      // was dropped (gap check) — idempotent frame ids per the step-5 integrity requirement.
      const send = (o: unknown) => { if (!closed) { try { controller.enqueue(frame(o && typeof o === "object" ? { seq: ++seq, ...(o as Record<string, unknown>) } : o)); } catch { closed = true; } } };
      const finish = () => { if (!closed) { try { controller.enqueue(DONE); controller.close(); } catch { /* already closed */ } closed = true; } };
      let gotFirstByte = false, lastSentAt = Date.now();
      let firstByteTimer: ReturnType<typeof setTimeout> | undefined;
      const heartbeat = setInterval(() => {
        if (closed) return;
        send({ type: "CUSTOM", name: CE.heartbeat, value: { t: new Date().toISOString(), elapsedMs: Date.now() - t0, sinceLastFrameMs: Date.now() - lastSentAt } });
      }, CHAT_HEARTBEAT_MS);
      // Stall watchdog: when no visible frame has gone out for >600 ms the shell shows the animated "Working…" band (ondemand.filler on), and the
      // band is withdrawn on the next real frame — so dead air never exceeds 800 ms without a visible change, whatever upstream is doing.
      let fillerOn = false; let stallTicks = 0;
      const stall = setInterval(() => {
        if (closed) return;
        const quiet = Date.now() - lastSentAt;
        if (!fillerOn && quiet > 600) { fillerOn = true; send({ type: "CUSTOM", name: CE.filler, value: { on: true, derived: true, quietMs: quiet, elapsedMs: Date.now() - t0 } }); }
        else if (fillerOn && quiet > 600) { stallTicks += 1; send({ type: "CUSTOM", name: CE.filler, value: { on: true, derived: true, tick: stallTicks, quietMs: quiet, elapsedMs: Date.now() - t0 } }); }
      }, 300);
      const cleanup = () => { clearInterval(heartbeat); clearInterval(stall); clearTimeout(firstByteTimer); clearTimeout(totalTimer); };
      const status = (phase: string, extra: Record<string, unknown> = {}) => { send({ type: "CUSTOM", name: CE.status, value: { phase, elapsedMs: Date.now() - t0, ...extra } }); lastSentAt = Date.now(); };

      // Immediate frames — flushed before any upstream await (first visible event well under 400 ms).
      send({ type: "RUN_STARTED", threadId, runId });
      status("connecting", { endpointId: ENDPOINT_ID, endpointLabel: ENDPOINT_LABEL, reasoningMode: REASONING_MODE, pluginIds, pluginNames: pluginIds.map((id) => PLUGIN_NAMES[id] ?? id), droppedPluginIds, sessionKnown: sessionFromHeaderPath });

      let text = "", textStarted = false, buf = "";
      let firstTokenAt = 0; let firstFrameAt = 0; let stepCounter = 0; let currentStepId = ""; let summaryIndex = 0;
      const realSources = new Map<string, Src>();
      const pluginErr: { current: { message: string; raw: string } | null } = { current: null };
      const startText = () => { if (!textStarted) { textStarted = true; send({ type: "TEXT_MESSAGE_START", messageId, role: "assistant" }); } };
      const fillerOff = () => { if (fillerOn) { fillerOn = false; stallTicks = 0; send({ type: "CUSTOM", name: CE.filler, value: { on: false, derived: true, elapsedMs: Date.now() - t0 } }); } };
      const custom = (name: string, value: Record<string, unknown>) => { if (name !== CE.filler && name !== CE.heartbeat) fillerOff(); send({ type: "CUSTOM", name, value: { elapsedMs: Date.now() - t0, ...value } }); lastSentAt = Date.now(); };
      // ---- tool cards: one per plugin id (pinned Perplexity opens on the first planning frame; others open when the plan/agents name them)
      type Tool = { id: string; name: string; open: boolean; stepId?: string; startedAt: number };
      const tools = new Map<string, Tool>();
      const pluginName = (id: string) => PLUGIN_NAMES[id] ?? id;
      const toolStart = (pid: string, name?: string, stepId?: string, input?: string) => {
        if (tools.has(pid)) return;
        const id = crypto.randomUUID(); tools.set(pid, { id, name: name || pluginName(pid), open: true, stepId, startedAt: Date.now() });
        markPluginInvoked(pid); // plugin-state `invoked` (plugin-catalogue.ts) — a tool card is open for this id in the current run
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
      const emitSources = (partial: boolean, pid?: string) => custom(CE.sources, { messageId, pluginId: pid ?? PLUGIN_ID, pluginName: pluginName(pid ?? PLUGIN_ID), partial, sources: [...realSources.values()].slice(0, 25) });
      const typedError = (code: string, message: string, raw: string) => custom(CE.error, { code, message, raw: raw.slice(0, 2000) });
      const detectPluginError = (haystack: string, raw: string) => {
        if (pluginErr.current) return;
        const m = PLUGIN_ERROR_RE.exec(haystack);
        if (!m) return;
        const hit = m[0].replace(/\s+/g, " ").trim();
        const credits = /credits/i.test(hit);
        const others = pluginIds.filter((id) => id !== PLUGIN_ID).map((id) => pluginName(id));
        pluginErr.current = { message: `${PLUGIN_NAME} returned an upstream error: "${credits ? "Internal server error — Not enough credits" : hit}"${credits ? " (the OnDemand account's Perplexity credits are exhausted)" : ""}. No other plugin was substituted${others.length ? `; ${others.join(", ")} ${others.length === 1 ? "was" : "were"} also attached to this turn and any text below comes from ${others.length === 1 ? "it" : "them"} or the model's own knowledge` : ""}.`, raw };
        typedError("plugin_error", pluginErr.current.message, raw);
        markPluginBlocked(PLUGIN_ID, pluginErr.current.message); // plugin-state `blocked` until a later run clears it (plugin-catalogue.ts)
        toolDone(PLUGIN_ID, "error", { message: pluginErr.current.message, raw: raw.slice(0, 1200) });
      };
      let thinkingBuf = ""; let planBuf = ""; let planEmitted = false; let objectiveSent = false; let stepBuf = ""; const stepEmittedFor = new Set<number>();
      let planStepTotal = 0; let earlyPlanSteps = 0; const derivedSummary = new Map<number, { title: string; hosts: string[]; n: number; closed: boolean }>();
      const tryParseJson = (t: string): unknown => { const i = t.indexOf("{"); if (i < 0) return null; let depth = 0, inStr = false, esc = false; for (let k = i; k < t.length; k++) { const c = t[k]; if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; } if (c === '"') inStr = true; else if (c === "{") depth++; else if (c === "}") { depth--; if (depth === 0) { try { return JSON.parse(t.slice(i, k + 1)); } catch { return null; } } } } return null; };
      const planFromJson = (j: unknown): { objective?: string; steps: { id: string; title: string; query?: string; plugins?: string[] }[] } => { const r = (j && typeof j === "object" ? j : {}) as Record<string, unknown>; const steps = Array.isArray(r.steps) ? r.steps : []; return { objective: typeof r.objective === "string" ? r.objective.slice(0, 400) : typeof r.title === "string" ? r.title.slice(0, 400) : undefined, steps: steps.map((x, i) => { const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>; return { id: String(o.id ?? o.step_id ?? i + 1), title: String(o.title ?? o.user_query ?? `Step ${i + 1}`).slice(0, 160), query: typeof o.user_query === "string" ? o.user_query.slice(0, 600) : undefined, plugins: Array.isArray(o.plugins) ? o.plugins.map((p) => (typeof p === "string" ? p : String((p as Record<string, unknown>).name ?? (p as Record<string, unknown>).pluginId ?? ""))).filter(Boolean) : undefined }; }) }; };

      /** Translate one typed UI event into AG-UI frames. Returns true on the terminal [DONE]. */
      const dispatch = (u: UiEvent, raw: string): boolean => {
        switch (u.kind) {
          case "done": return true;
          case "heartbeat": return false;
          case "error": throw new UpstreamError(`OnDemand error frame: ${u.message}`, 502, u.code);
          case "metrics": custom(CE.metrics, { publicMetrics: u.publicMetrics, firstTokenMs: firstTokenAt ? firstTokenAt - t0 : null, pluginIds }); return false;
          case "plugins_suggested": custom(CE.plugins, { phase: u.phase, plugins: u.plugins }); if (u.phase === "initialized") status("planning", { statusType: "plugin_suggestion.initialized", statusMessage: "Finding plugins" }); return false;
          case "plan": planStepTotal = Math.max(planStepTotal, u.steps.length); custom(CE.plan, { objective: u.objective ?? null, steps: u.steps }); status("planning", { statusType: "plan_created", statusMessage: u.objective ?? "Execution plan created", steps: u.steps.length }); return false;
          case "step_start": {
            stepCounter += 1; currentStepId = u.stepId || String(stepCounter);
            custom(CE.step, { phase: "start", stepId: currentStepId, index: stepCounter, label: u.label, query: u.query ?? null });
            // Optimistic checkpoint card for every step after the first (filled by summarize_history.completed when the agent emits it).
            if (stepCounter > 1) { summaryIndex = stepCounter - 1; custom(CE.summary, { phase: "start", index: summaryIndex, stepId: currentStepId, optimistic: true }); }
            return false;
          }
          case "agents_retrieved": for (const pid of refsToIds(u.plugins)) toolStart(pid, u.plugins.find((p) => p.id === pid)?.name, u.stepId); custom(CE.agents, { phase: "retrieved", stepId: u.stepId ?? currentStepId, plugins: u.plugins }); return false;
          case "executing": for (const pid of refsToIds(u.plugins)) toolStart(pid, u.plugins.find((p) => p.id === pid)?.name, u.stepId); custom(CE.agents, { phase: "executing", stepId: u.stepId ?? currentStepId, plugins: u.plugins }); status("researching", { statusType: "executing", stepId: u.stepId ?? currentStepId, plugins: u.plugins.length }); return false;
          case "execution_done": {
            const ids = refsToIds(u.plugins); const targets = ids.length ? ids : [...tools.keys()].filter((k) => tools.get(k)!.open);
            for (const pid of targets) { if (u.ok) toolDone(pid, "ok", { message: u.message || undefined }); else { typedError("execution_failed", `${pluginName(pid)}: ${u.message || "execution failed"}`, raw); toolDone(pid, "error", { message: u.message || "execution failed", raw: raw.slice(0, 1200) }); } }
            custom(CE.step, { phase: u.ok ? "done" : "failed", stepId: u.stepId ?? currentStepId, index: stepCounter, message: u.message });
            return false;
          }
          case "summary_start": summaryIndex = u.index || summaryIndex || stepCounter; custom(CE.summary, { phase: "start", index: summaryIndex, stepId: u.stepId ?? currentStepId, optimistic: false }); return false;
          case "summary_done": custom(CE.summary, { phase: "done", index: u.index || summaryIndex || stepCounter, stepId: u.stepId ?? currentStepId, text: u.text, at: new Date().toISOString() }); return false;
          case "thinking": {
            if (u.channel === "planning" || u.channel === "plan" || u.channel === "step" || u.channel === "step_output") toolStart(PLUGIN_ID, PLUGIN_NAME, u.stepId);
            if ((u.channel === "step" || u.channel === "step_output" || u.channel === "fulfillment") && derivedSummary.size) {
              const cur = u.channel === "fulfillment" ? Number.MAX_SAFE_INTEGER : Number(u.stepId) || 0;
              for (const [idx, d] of derivedSummary) if (!d.closed && cur > idx) { d.closed = true; custom(CE.summary, { phase: "done", index: idx, stepId: String(idx), derived: true, text: `${d.title} — ${d.n} source${d.n === 1 ? "" : "s"}${d.hosts.length ? ` from ${d.hosts.join(", ")}` : ""}.`, at: new Date().toISOString() }); }
            }
            if (u.delta) { custom(CE.thinking, { kind: u.channel, delta: u.delta, stepId: u.stepId ?? currentStepId }); thinkingBuf = (thinkingBuf + u.delta).slice(-800); detectPluginError(thinkingBuf, raw); }
            // This account's stream carries the plan only as planning_output JSON text (no statusLog plan_created frame): read it while it streams
            // (UX doc "Read while it streams: the objective becomes the opening sentence") and emit ondemand.plan once it parses.
            if (u.channel === "plan" && u.delta && !planEmitted) {
              planBuf += u.delta;
              const parsed = tryParseJson(planBuf);
              if (parsed) { const plan = planFromJson(parsed); if (plan.objective || plan.steps.length) { planEmitted = true; planStepTotal = Math.max(planStepTotal, plan.steps.length); custom(CE.plan, { objective: plan.objective ?? null, steps: plan.steps, source: "planning_output" }); status("planning", { statusType: "plan_created", statusMessage: plan.objective ?? "Execution plan created", steps: plan.steps.length }); } }
              else {
                const m = /"objective"\s*:\s*"((?:[^"\\]|\\.){12,})/.exec(planBuf); if (m && !objectiveSent) { objectiveSent = true; status("planning", { statusType: "planning", statusMessage: m[1].replace(/\\"/g, "\"").slice(0, 200) }); }
                // Early plan: the first complete step title is enough to paint the Plan card (state "provisional"); the full plan replaces it when the JSON closes.
                const titles = [...planBuf.matchAll(/"title"\s*:\s*"((?:[^"\\]|\\.){4,160})"/g)].map((x) => x[1].replace(/\\"/g, "\"")).slice(1); // index 0 is the plan title itself
                if (titles.length > earlyPlanSteps) { earlyPlanSteps = titles.length; custom(CE.plan, { objective: m ? m[1].replace(/\\"/g, "\"").slice(0, 400) : null, steps: titles.map((t, i) => ({ id: String(i + 1), title: t })), provisional: true, source: "planning_output:early" }); }
              }
            }
            if (u.channel === "step_output" && u.delta) {
              stepBuf += u.delta;
              const parsed = tryParseJson(stepBuf);
              if (parsed && !stepEmittedFor.has(stepBuf.length)) {
                stepEmittedFor.add(stepBuf.length);
                const r = parsed as { title?: string; plugins?: { pluginId?: string; name?: string; api_request_parameters?: Record<string, unknown> }[] };
                stepCounter += 1; currentStepId = u.stepId || String(stepCounter);
                custom(CE.step, { phase: "start", stepId: currentStepId, index: stepCounter, label: String(r.title ?? `Step ${stepCounter}`).slice(0, 120), query: null, source: "step_output" });
                for (const pl of r.plugins ?? []) { const pid = String(pl.pluginId ?? ""); const input = pl.api_request_parameters ? String(Object.values(pl.api_request_parameters)[0] ?? "") : ""; if (pluginIds.includes(pid)) toolStart(pid, pl.name ? pluginName(pid) : undefined, currentStepId, input || undefined); }
                stepBuf = "";
              }
            }
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
            // STEP_BOUNDARY (eventMap.ts): plugin_sources is the last frame of its step. When the plan has a further step, open the DERIVED
            // "Summarising step N" checkpoint now; it is closed (with the step title + source hosts) by the next step's first frame.
            const sIdx = Number(u.stepId) || stepCounter || 1;
            const hosts = [...new Set(u.items.map((c) => c.sourceName))].slice(0, 4);
            const moreSteps = planStepTotal > sIdx;
            if (moreSteps && !derivedSummary.has(sIdx)) {
              derivedSummary.set(sIdx, { title: u.stepTitle ?? `Step ${sIdx}`, hosts, n: u.items.length, closed: false });
              custom(CE.summary, { phase: "start", index: sIdx, stepId: String(sIdx), derived: true, source: "plugin_sources", stepTitle: u.stepTitle ?? null });
              custom(CE.step, { phase: "done", stepId: String(sIdx), index: sIdx, message: `${u.items.length} sources`, derived: true });
              status("planning", { statusType: "summarising", statusMessage: `Summarising step ${sIdx}`, stepId: String(sIdx) });
            } else {
              status("answering", { sources: realSources.size });
            }
            return false;
          }
          case "answer": {
            if (!firstTokenAt && u.delta) firstTokenAt = Date.now();
            fillerOff(); startText(); text += u.delta; send({ type: "TEXT_MESSAGE_CONTENT", messageId, delta: u.delta }); lastSentAt = Date.now();
            detectPluginError(text.slice(-600), raw);
            return false;
          }
          case "answer_complete": custom(CE.answerComplete, { chars: u.text.length }); return false;
          case "clarification": custom(CE.clarification, { messageId: u.messageId ?? null, queries: u.queries }); status("awaiting-input", { statusType: "clarification_request" }); return false;
          case "require_creds": custom(CE.requireCreds, { pluginId: u.pluginId ?? null, service: u.service ?? null, fields: u.fields, agent: u.agent ?? null }); status("awaiting-input", { statusType: "require_creds" }); return false;
          case "awaiting_input": custom(CE.awaitingInput, { prompt: u.prompt, options: u.options ?? [], agent: u.agent ?? null }); status("awaiting-input", { statusType: "awaiting_input" }); return false;
          case "awaiting_browser_action": custom(CE.awaitingBrowserAction, { action: u.action ?? null, message: u.message ?? null, url: u.url ?? null, agent: u.agent ?? null }); status("awaiting-input", { statusType: "awaiting_browser_action" }); return false;
          case "filler": custom(CE.filler, { on: u.on }); return false;
          case "agent": custom(CE.agent, { subtype: u.subtype, agent: u.agent ?? null, data: u.data ?? null }); return false;
          case "status": status(u.statusType === "fulfilling" ? "answering" : "planning", { statusType: u.statusType, statusMessage: u.message, stepQuery: u.stepQuery ?? null }); return false;
          case "unknown": custom(CE.unknown, { eventType: u.eventType }); return false;
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
        send({ type: "CUSTOM", name: CE.session, value: { sessionId, created: sessionCreated, viaHeader: sessionFromHeaderPath, endpointId: ENDPOINT_ID, endpointLabel: ENDPOINT_LABEL, reasoningMode: REASONING_MODE, pluginIds } });
        audit.sessionId = sessionId; audit.sessionCreated = sessionCreated;
        // 2. query — stream
        status("querying", { sessionId });
        custom(CE.request, { method: "POST", proxy: "/api/chat", upstream: `POST ${ONDEMAND_BASE_URL.replace(/^https?:\/\//, "")}/chat/v1/sessions/{id}/query`, body: { endpointId: ENDPOINT_ID, endpointLabel: ENDPOINT_LABEL, reasoningMode: REASONING_MODE, responseMode: RESPONSE_MODE, pluginIds, queryChars: query.length, systemContextChars: isFirstTurn && ctx.systemContext ? String(ctx.systemContext).length : 0, attachments: attachments.map((a) => ({ mediaId: a.mediaId, name: a.name, chars: a.text.length })) }, sessionId, sessionCreated });
        if (attachments.length) custom(CE.attachments, { items: attachments.map((a) => ({ mediaId: a.mediaId, name: a.name, kind: a.kind, extractedChars: a.extractedChars, grounded: a.known })) });
        const prefix = `${attachmentPrefix}${isFirstTurn && ctx.systemContext ? `${String(ctx.systemContext).slice(0, 6000)}\n\nQuestion: ` : attachmentPrefix ? "Question: " : ""}`;
        const qBody = { query: prefix + query, endpointId: ENDPOINT_ID, responseMode: RESPONSE_MODE, pluginIds, reasoningMode: REASONING_MODE };
        const qUrl = `${ONDEMAND_BASE_URL}/chat/v1/sessions/${sessionId}/query`;
        const qHeaders = { ...H, accept: "text/event-stream" };
        audit.query = { url: qUrl, headers: redactHeaders(qHeaders), body: { ...qBody, query: `${prefix ? `<systemContext+attachments ${prefix.length} chars> ` : ""}${query.slice(0, 300)}` }, attachments: attachments.map((a) => ({ mediaId: a.mediaId, name: a.name, chars: a.text.length })) };
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
          if (realSources.size) clearPluginBlocked(PLUGIN_ID); // a clean run with real sources lifts a stale `blocked` state
          send({ type: "TEXT_MESSAGE_END", messageId });
          for (const [idx, d] of derivedSummary) if (!d.closed) { d.closed = true; custom(CE.summary, { phase: "done", index: idx, stepId: String(idx), derived: true, text: `${d.title} — ${d.n} source${d.n === 1 ? "" : "s"}${d.hosts.length ? ` from ${d.hosts.join(", ")}` : ""}.`, at: new Date().toISOString() }); }
          if (stepCounter > 0) custom(CE.step, { phase: "done", stepId: currentStepId, index: stepCounter, message: "answer written" });
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
