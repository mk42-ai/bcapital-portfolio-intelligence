/**
 * Typed OnDemand submit-query v1 SSE adapter (server-side).
 * Input: one upstream frame (SSE `event:` name + `data:` text). Output: a discriminated union of UI events that the /api/chat bridge
 * forwards to the browser as AG-UI frames. Covers every frame family in the submit-query v1 reference:
 *   message/statusLog (all statusTypes incl. plugin_suggestion.*, plan_created, analyzing+stepQuery, agents_retrieved, executing,
 *   execution_completed|failed, summarize_history.initialized|completed, fulfilling, fulfillment_completed), message/fulfillment,
 *   message/metricsLog, message/clarification_request, thinking/{planning,step,fulfillment}_thinking, thinking/{planning,step}_output,
 *   plugin_sources, agent/ondemand_agent.* (lifecycle, execution, outputs, interaction), heartbeat, [DONE], [ERROR]:.
 * Unknown subtypes are tolerated (→ {kind:"unknown"}) and never throw.
 */
export type PluginRef = { id: string; name: string; logoUrl?: string };
export type PlanStep = { id: string; title: string; query?: string; plugins?: string[] };
export type Citation = { url: string; title: string; sourceName: string; imageUrl?: string };

export type UiEvent =
  | { kind: "heartbeat"; time?: string }
  | { kind: "status"; statusType: string; message: string; stepQuery?: string; raw: Record<string, unknown> }
  | { kind: "plugins_suggested"; plugins: PluginRef[]; phase: "initialized" | "completed" }
  | { kind: "plan"; objective?: string; steps: PlanStep[]; raw: unknown }
  | { kind: "step_start"; stepId: string; label: string; query?: string }
  | { kind: "agents_retrieved"; stepId?: string; plugins: PluginRef[] }
  | { kind: "executing"; stepId?: string; plugins: PluginRef[] }
  | { kind: "execution_done"; stepId?: string; ok: boolean; plugins: PluginRef[]; message: string }
  | { kind: "summary_start"; stepId?: string; index: number }
  | { kind: "summary_done"; stepId?: string; index: number; text: string }
  | { kind: "thinking"; channel: "planning" | "step" | "fulfillment" | "plan" | "step_output"; delta: string; stepId?: string }
  | { kind: "sources"; pluginId?: string; pluginName?: string; items: Citation[] }
  | { kind: "answer"; delta: string }
  | { kind: "answer_complete"; text: string }
  | { kind: "metrics"; publicMetrics: Record<string, number> }
  | { kind: "clarification"; queries: { question: string; options?: string[] }[]; messageId?: string }
  | { kind: "agent"; subtype: string; agent?: { id?: string; name?: string }; data?: Record<string, unknown> }
  | { kind: "require_creds"; pluginId?: string; service?: string; fields: { key: string; label?: string; type?: string }[]; agent?: { id?: string; name?: string } }
  | { kind: "awaiting_input"; prompt: string; options?: string[]; agent?: { id?: string; name?: string } }
  | { kind: "awaiting_browser_action"; action?: string; message?: string; url?: string; agent?: { id?: string; name?: string } }
  | { kind: "filler"; on: boolean }
  | { kind: "error"; code: string; message: string; raw: string }
  | { kind: "done" }
  | { kind: "unknown"; eventType: string; raw: Record<string, unknown> };

const str = (v: unknown, max = 4000) => (typeof v === "string" ? v.slice(0, max) : "");
const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const toPluginRefs = (v: unknown): PluginRef[] => {
  if (!Array.isArray(v)) return [];
  return v.map((p) => {
    const r = asRecord(p);
    const id = str(r.pluginId ?? r.id ?? r.agentId ?? r.plugin_id, 80);
    const name = str(r.name ?? r.pluginName ?? r.title ?? id, 120) || id;
    const logoUrl = str(r.logoUrl ?? r.logo ?? r.image, 600) || undefined;
    return id || name ? { id: id || name, name, ...(logoUrl && /^https?:\/\//.test(logoUrl) ? { logoUrl } : {}) } : null;
  }).filter((x): x is PluginRef => !!x);
};
const toSteps = (plan: unknown): { objective?: string; steps: PlanStep[] } => {
  const r = asRecord(plan);
  const steps = Array.isArray(r.steps) ? r.steps : Array.isArray(r.plan) ? r.plan : [];
  return {
    objective: str(r.objective ?? r.title, 400) || undefined,
    steps: steps.map((s, i) => { const x = asRecord(s); return { id: str(x.id ?? x.stepId ?? x.step_id, 40) || String(i + 1), title: str(x.title ?? x.label ?? x.user_query ?? x.query, 200) || `Step ${i + 1}`, query: str(x.user_query ?? x.query, 600) || undefined, plugins: Array.isArray(x.plugins) ? x.plugins.map((p) => (typeof p === "string" ? p : str(asRecord(p).name ?? asRecord(p).pluginId, 80))).filter(Boolean) : undefined }; }),
  };
};

/** Parse one frame. `ev` = SSE event name (message|thinking|agent|heartbeat|""), `data` = the data payload (joined, trimmed). */
export function parseFrame(ev: string, data: string): UiEvent {
  if (data === "[DONE]") return { kind: "done" };
  if (data.startsWith("[ERROR]")) {
    const raw = data.slice(7).replace(/^:/, "").trim();
    let message = raw || "Upstream error"; let code = "upstream_error";
    try { const j = JSON.parse(raw) as { message?: string; errorCode?: string; error?: string }; message = j.message ?? j.error ?? message; code = j.errorCode ?? code; } catch { /* plain text */ }
    return { kind: "error", code, message, raw: data };
  }
  let j: Record<string, unknown>;
  try { j = JSON.parse(data) as Record<string, unknown>; } catch { return { kind: "unknown", eventType: "unparseable", raw: { data: data.slice(0, 500) } }; }
  const et = str(j.eventType, 80);
  if (ev === "heartbeat" || (!et && typeof j.time === "string")) return { kind: "heartbeat", time: str(j.time, 40) };
  if (et === "error" || typeof j.error === "string" || (typeof j.message === "string" && typeof j.errorCode === "string")) {
    return { kind: "error", code: str(j.errorCode, 80) || "upstream_error", message: str(j.error ?? j.message, 1000) || "OnDemand reported an error", raw: data };
  }
  // ---- agent channel -------------------------------------------------------------------------------------
  if (ev === "agent" || et.startsWith("ondemand_agent.")) {
    const subtype = et.replace(/^ondemand_agent\./, "");
    const agent = asRecord(j.agent); const d = asRecord(j.data);
    const agentRef = { id: str(agent.id, 80) || undefined, name: str(agent.name, 120) || undefined };
    if (subtype === "require_creds") {
      const fields = Array.isArray(d.fields) ? d.fields.map((f) => { const x = asRecord(f); return { key: str(x.key ?? x.name, 80), label: str(x.label ?? x.title, 120) || undefined, type: str(x.type, 40) || undefined }; }).filter((f) => f.key) : [];
      return { kind: "require_creds", pluginId: str(d.pluginId, 80) || undefined, service: str(d.service, 120) || undefined, fields, agent: agentRef };
    }
    if (subtype === "awaiting_input") {
      const options = Array.isArray(d.options) ? d.options.map((o) => str(typeof o === "string" ? o : asRecord(o).label ?? asRecord(o).value, 200)).filter(Boolean) : undefined;
      return { kind: "awaiting_input", prompt: str(d.prompt ?? d.content ?? d.question ?? d.message, 1000) || "The agent needs your input", options, agent: agentRef };
    }
    if (subtype === "awaiting_browser_action") return { kind: "awaiting_browser_action", action: str(d.action, 40) || undefined, message: str(d.message ?? d.content, 600) || undefined, url: str(d.novncUrl ?? d.url, 600) || undefined, agent: agentRef };
    if (subtype === "filler_start") return { kind: "filler", on: true };
    if (subtype === "filler_end") return { kind: "filler", on: false };
    if (subtype === "thinking" && typeof d.content === "string") return { kind: "thinking", channel: "step", delta: d.content };
    return { kind: "agent", subtype, agent: agentRef, data: d };
  }
  // ---- thinking channel ----------------------------------------------------------------------------------
  if (et.endsWith("_thinking")) {
    const ch = et.replace(/_thinking$/, "");
    return { kind: "thinking", channel: ch === "planning" ? "planning" : ch === "fulfillment" ? "fulfillment" : "step", delta: str(asRecord(j.thinking).delta, 4000), stepId: str(j.stepId, 40) || undefined };
  }
  if (et === "planning_output") return { kind: "thinking", channel: "plan", delta: str(asRecord(j.output).delta, 4000) };
  if (et === "step_output") return { kind: "thinking", channel: "step_output", delta: str(asRecord(j.output).delta, 4000), stepId: str(j.stepId, 40) || undefined };
  // ---- message channel -----------------------------------------------------------------------------------
  if (et === "fulfillment" && typeof j.answer === "string") return { kind: "answer", delta: j.answer };
  if (et === "metricsLog") return { kind: "metrics", publicMetrics: asRecord(j.publicMetrics) as Record<string, number> };
  if (et === "plugin_sources") {
    const s = asRecord(j.sources); const items = Array.isArray(s.items) ? s.items : Array.isArray(j.items) ? j.items : [];
    const cites: Citation[] = [];
    for (const it of items) { const x = asRecord(it); const url = str(x.url, 800); if (!url || !/^https?:\/\//.test(url)) continue; let host = str(x.domain, 120); if (!host) { try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { host = url; } } const img = str(x.imageUrl, 800); cites.push({ url, title: (str(x.title, 160) || host), sourceName: host, ...(img && /^https?:\/\//.test(img) ? { imageUrl: img } : {}) }); }
    return { kind: "sources", pluginId: str(s.pluginId, 80) || undefined, pluginName: str(s.pluginName, 120) || undefined, items: cites };
  }
  if (et === "clarification_request") {
    const cr = asRecord(j.clarificationRequest); const qs = Array.isArray(cr.queries) ? cr.queries : [];
    return { kind: "clarification", messageId: str(j.messageId, 80) || undefined, queries: qs.map((q) => { const x = asRecord(q); return { question: str(x.query ?? x.question, 600), options: Array.isArray(x.options) ? x.options.map((o) => str(typeof o === "string" ? o : asRecord(o).label ?? asRecord(o).value, 200)).filter(Boolean) : undefined }; }).filter((q) => q.question) };
  }
  if (et === "statusLog") {
    const cs = asRecord(j.currentStatusLog); const st = str(cs.statusType, 80); const message = str(cs.statusMessage, 400); const stepQuery = str(cs.stepQuery, 600) || undefined;
    const stepId = str(cs.stepId ?? cs.step_id ?? j.stepId, 40) || undefined;
    const plugins = toPluginRefs(cs.suggestedPlugins).length ? toPluginRefs(cs.suggestedPlugins) : toPluginRefs(cs.retrievedAgents).length ? toPluginRefs(cs.retrievedAgents) : toPluginRefs(cs.executedAgents);
    if (st === "plugin_suggestion.initialized") return { kind: "plugins_suggested", plugins: [], phase: "initialized" };
    if (st === "plugin_suggestion.completed") return { kind: "plugins_suggested", plugins, phase: "completed" };
    if (st === "plan_created") { const { objective, steps } = toSteps(cs.queryPlan ?? cs.plan); return { kind: "plan", objective, steps, raw: cs.queryPlan ?? null }; }
    if (st === "analyzing" && stepQuery) return { kind: "step_start", stepId: stepId ?? "", label: stepQuery.length > 90 ? `${stepQuery.slice(0, 88)}…` : stepQuery, query: stepQuery };
    if (st === "agents_retrieved") return { kind: "agents_retrieved", stepId, plugins };
    if (st === "executing") return { kind: "executing", stepId, plugins };
    if (st === "execution_completed" || st === "execution_failed") return { kind: "execution_done", stepId, ok: st === "execution_completed", plugins, message };
    if (st === "summarize_history.initialized") return { kind: "summary_start", stepId, index: Number(cs.stepIndex ?? cs.index ?? 0) || 0 };
    if (st === "summarize_history.completed") return { kind: "summary_done", stepId, index: Number(cs.stepIndex ?? cs.index ?? 0) || 0, text: str(cs.summary ?? cs.answer ?? cs.statusMessage, 6000) };
    if (st === "fulfillment_completed" && typeof cs.answer === "string") return { kind: "answer_complete", text: cs.answer };
    return { kind: "status", statusType: st || "status", message, stepQuery, raw: cs };
  }
  return { kind: "unknown", eventType: et || ev || "?", raw: j };
}

/** Upstream plugin failure signature — OnDemand delivers it only inside thinking/answer deltas, never as an error frame. */
export const PLUGIN_ERROR_RE = /not enough credits|"error"\s*:\s*"internal server error"|tool returned an error|insufficient credits|rate limit exceeded/i;
