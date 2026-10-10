/**
 * eventMap.ts — THE single place where OnDemand submit-query v1 SSE frame names are bound to UI event kinds.
 *
 * Every upstream identifier the bridge recognises lives here: SSE `event:` names, JSON `eventType` values, `statusLog.statusType`
 * values and `agent/ondemand_agent.*` subtypes. `src/lib/ondemand/sse-adapter.ts` consults these tables and nothing else, so when
 * OnDemand renames or enriches an event (e.g. the between-step summarisation `summarize_history.*` pair) the rebind is a one-line
 * change in this file. Unknown names fall through to `{kind:"unknown"}` and are surfaced, never dropped silently.
 *
 * Reference: submit-query-v1-sse-reference.pdf (event names, payload fields) and OnDemand-Run-UX-Before-After.pdf (22 frame signatures).
 */
export type UiKind =
  | "heartbeat" | "status" | "plugins_suggested" | "plan" | "step_start" | "agents_retrieved" | "executing" | "execution_done"
  | "summary_start" | "summary_done" | "thinking" | "sources" | "answer" | "answer_complete" | "metrics" | "clarification"
  | "agent" | "require_creds" | "awaiting_input" | "awaiting_browser_action" | "filler" | "error" | "done" | "unknown";

/** Terminal / control markers checked BEFORE JSON parsing (reference: "Check these strings before JSON parsing"). */
export const TERMINAL = { done: "[DONE]", errorPrefix: "[ERROR]" } as const;

/** SSE `event:` channel names. */
export const SSE_EVENT = { message: "message", thinking: "thinking", agent: "agent", heartbeat: "heartbeat" } as const;

/** JSON `eventType` → UI kind (for frames whose meaning does not depend on statusType). */
export const EVENT_TYPE: Record<string, UiKind> = {
  fulfillment: "answer",                 // message/fulfillment — answer deltas in `answer`
  metricsLog: "metrics",                 // message/metricsLog — publicMetrics
  clarification_request: "clarification",// message/clarification_request — clarificationRequest.queries[]
  planning_thinking: "thinking",         // thinking/planning_thinking — thinking.delta
  step_thinking: "thinking",             // thinking/step_thinking — thinking.delta (plugin_thinking maps here upstream)
  fulfillment_thinking: "thinking",      // thinking/fulfillment_thinking — thinking.delta
  planning_output: "thinking",           // thinking/planning_output — output.delta (plan JSON as text)
  step_output: "thinking",               // thinking/step_output — output.delta (plugin calls JSON)
  plugin_sources: "sources",             // message/plugin_sources — sources.items[] (observed; not in the PDF)
  error: "error",
  statusLog: "status",                   // refined by STATUS_TYPE below
};
/** Which `eventType`s carry a reasoning delta and under which field + channel label. */
export const THINKING_CHANNEL: Record<string, { field: "thinking" | "output"; channel: "planning" | "step" | "fulfillment" | "plan" | "step_output" }> = {
  planning_thinking: { field: "thinking", channel: "planning" },
  step_thinking: { field: "thinking", channel: "step" },
  fulfillment_thinking: { field: "thinking", channel: "fulfillment" },
  planning_output: { field: "output", channel: "plan" },
  step_output: { field: "output", channel: "step_output" },
};

/** `currentStatusLog.statusType` → UI kind. Anything not listed renders as a generic status line. */
export const STATUS_TYPE: Record<string, UiKind> = {
  "plugin_suggestion.initialized": "plugins_suggested",
  "plugin_suggestion.completed": "plugins_suggested",
  initializing: "status",
  analyzing: "step_start",               // only when `stepQuery` is present; otherwise a plain status
  plan_created: "plan",                  // currentStatusLog.queryPlan
  agents_retrieved: "agents_retrieved",  // retrievedAgents[]
  executing: "executing",                // executedAgents[]
  execution_completed: "execution_done",
  execution_failed: "execution_done",
  execution_log_created: "status",
  fulfilling: "status",
  fulfillment_completed: "answer_complete", // currentStatusLog.answer
  // Between-step summarisation. Rebind here if OnDemand renames/enriches the pair.
  "summarize_history.initialized": "summary_start",
  "summarize_history.completed": "summary_done",
};
/** Field names read from statusLog payloads (so an enriched event only needs a new entry here). */
export const STATUS_FIELDS = {
  stepQuery: ["stepQuery"],
  stepId: ["stepId", "step_id"],
  plan: ["queryPlan", "plan"],
  suggestedPlugins: ["suggestedPlugins"],
  retrievedAgents: ["retrievedAgents"],
  executedAgents: ["executedAgents"],
  summaryText: ["summary", "answer", "statusMessage"],
  summaryIndex: ["stepIndex", "index"],
  answer: ["answer"],
} as const;

/** `agent/ondemand_agent.<subtype>` → UI kind. Lifecycle/execution/output subtypes stay generic `agent` frames (rail log). */
export const AGENT_PREFIX = "ondemand_agent.";
export const AGENT_SUBTYPE: Record<string, UiKind> = {
  require_creds: "require_creds",
  awaiting_input: "awaiting_input",
  awaiting_browser_action: "awaiting_browser_action",
  filler_start: "filler",
  filler_end: "filler",
  thinking: "thinking",
  error: "error",
  // generic (rendered in the Agent rail log): before_init, no_init, initiated, progress, completed, stopped, token_usage, tool_call,
  // tool_result, tool_details, terminal, skills_used, todo, subagent_status, code_generation_init, code_generated, file_written,
  // artifact_ready, preview_ready, sandbox_created, novnc_ready, novnc_ended, graphs_ready, graphs_ended
};

/** Upstream plugin failure signature — OnDemand delivers it only inside thinking/answer deltas, never as an error frame. */
export const PLUGIN_ERROR_PATTERNS: RegExp = /not enough credits|"error"\s*:\s*"internal server error"|tool returned an error|insufficient credits|rate limit exceeded/i;

/** Client-side CUSTOM frame names emitted by the bridge (AG-UI `CUSTOM {name,value}`) — the contract the chat shell binds to. */
export const CLIENT_EVENT = {
  status: "ondemand.status", session: "ondemand.session", plugins: "ondemand.plugins", plan: "ondemand.plan", step: "ondemand.step",
  summary: "ondemand.summary", agents: "ondemand.agents", thinking: "ondemand.thinking", sources: "ondemand.sources", metrics: "ondemand.metrics",
  error: "ondemand.error", clarification: "ondemand.clarification", requireCreds: "ondemand.require_creds", awaitingInput: "ondemand.awaiting_input",
  awaitingBrowserAction: "ondemand.awaiting_browser_action", filler: "ondemand.filler", agent: "ondemand.agent", heartbeat: "ondemand.heartbeat",
  answerComplete: "ondemand.answer_complete", unknown: "ondemand.unknown", request: "ondemand.request",
} as const;

/** User-facing wording for the live line (the UX doc: first-person labels, one word for reasoning). */
export const LABEL = {
  thinking: "Thinking",
  working: "Working…",
  summarising: (n: number) => `Summarising step ${n}`,
  searching: (plugin: string) => `Searching with ${plugin}`,
  searched: (plugin: string, n: number) => `${plugin} searched · ${n} source${n === 1 ? "" : "s"}`,
  failed: (plugin: string) => `${plugin} failed`,
} as const;
