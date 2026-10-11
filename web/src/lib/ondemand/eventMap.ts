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
  heartbeat: "heartbeat",                // a7: heartbeat frames that DO carry eventType (observed ones carry only sessionId/messageId/time)
};
/** a7: eventTypes whose delta is planner/tool-definition JSON (Outputs disclosure), not reasoning prose. */
export const PLANNER_EVENT_TYPES = ["planning_output", "step_output"] as const;
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
  // file_written / artifact_ready / preview_ready stay generic `agent` frames here; the bridge (api/chat) reads their `data`
  // ({name|fileName|filename, url|fileUrl|downloadUrl|signedUrl, path|filePath, mime|mimeType|contentType, size|sizeBytes}) and persists
  // them as artifacts (backend /artifacts + OnDemand Media API), then streams CUSTOM ondemand.artifact.
  // generic (rendered in the Agent rail log): before_init, no_init, initiated, progress, completed, stopped, token_usage, tool_call,
  // tool_result, tool_details, terminal, skills_used, todo, subagent_status, code_generation_init, code_generated, file_written,
  // artifact_ready, preview_ready, sandbox_created, novnc_ready, novnc_ended, graphs_ready, graphs_ended
};

/**
 * Between-step summarisation — OBSERVED binding (2026-10-10, session 6ac9eaad261cbe23404841b1, two turns, 812 raw frames, see
 * web/artifacts/summarisation-event-observed.json): this account's stream carries NO statusLog frame of any kind — zero `summarize_history.*`,
 * zero `plan_created`. The step boundary is only visible as the LAST frame of step N (`plugin_sources`, stepId N, stepTitle) followed by the
 * FIRST frame of step N+1 (`step_thinking` / `step_output`, stepId N+1). The bridge derives the Summarising checkpoint from that pair and marks
 * the frames it emits `derived: true`; the documented `summarize_history.*` pair above stays bound so a real frame takes over the moment it ships.
 */
/**
 * TRACE 2026-10-10 (Agent 11, Team A) — session 6aca0a89261cbe2340484665, one two-step query (Fervo Energy vs Ormat Technologies funding, then
 * summarise), endpoint predefined-deepseek-flash, pluginIds [plugin-1741871229, plugin-1751872652], reasoningMode medium, 259 frames / 28.4 s.
 * Raw stream: web/proof/team-a/sse-trace.raw.log · table: web/proof/team-a/sse-event-families.json.
 *   event:thinking  → planning_thinking ×62 (first 1501 ms), planning_output ×32 (3486 ms), step_thinking ×19 (5644 ms, stepId 1→2),
 *                     step_output ×56 (5763 ms, stepId 1→2), fulfillment_thinking ×14 (23694 ms)
 *   event:message   → fulfillment ×65 (24160 ms), metricsLog ×1 (26372 ms), [DONE] (28385 ms)
 *   event:heartbeat → ×9 (3556 ms; sessionId/messageId/time, no eventType)
 *   statusType      → NONE. Zero message/statusLog frames: no summarize_history.initialized/completed, no plan_created, analyzing,
 *                     agents_retrieved, executing, execution_completed, fulfilling or fulfillment_completed. No between-step summarisation frame of
 *                     any name. plugin_sources did not occur in this run either (GPT Search returned citations only inline in the prose).
 *   Verdict: every observed name is already bound above → NO rebind. STEP_BOUNDARY-derived "Summarising step N" stays the only source of that state.
 */
export const STEP_BOUNDARY = {
  endOfStep: "plugin_sources",                       // eventType that closes a step (carries stepId + stepTitle)
  startOfNextStep: ["step_thinking", "step_output"], // first eventTypes of the following step (stepId increments)
  summaryTextFrom: "stepTitle+sources",              // what the derived checkpoint text is built from
} as const;

/** Upstream plugin failure signature — OnDemand delivers it only inside thinking/answer deltas, never as an error frame. */
export const PLUGIN_ERROR_PATTERNS: RegExp = /not enough credits|"error"\s*:\s*"internal server error"|tool returned an error|insufficient credits|rate limit exceeded/i;

/** Client-side CUSTOM frame names emitted by the bridge (AG-UI `CUSTOM {name,value}`) — the contract the chat shell binds to. */
export const CLIENT_EVENT = {
  status: "ondemand.status", session: "ondemand.session", plugins: "ondemand.plugins", plan: "ondemand.plan", step: "ondemand.step",
  summary: "ondemand.summary", agents: "ondemand.agents", thinking: "ondemand.thinking", sources: "ondemand.sources", metrics: "ondemand.metrics",
  error: "ondemand.error", clarification: "ondemand.clarification", requireCreds: "ondemand.require_creds", awaitingInput: "ondemand.awaiting_input",
  awaitingBrowserAction: "ondemand.awaiting_browser_action", filler: "ondemand.filler", agent: "ondemand.agent", heartbeat: "ondemand.heartbeat",
  answerComplete: "ondemand.answer_complete", unknown: "ondemand.unknown", request: "ondemand.request",
  attachments: "ondemand.attachments",  // Media API: {items:[{mediaId,name,kind,extractedChars,grounded}]} emitted right after CE.request
  voice: "ondemand.voice",              // Voice: {phase: "transcript"|"tts_queued"|"tts_playing"|"tts_done"|"barge_in", text?}
  artifact: "ondemand.artifact",        // Artifacts: {phase: "creating"|"ready"|"failed", key, name, kind?, artifact?, message?, origin}
  stepOutput: "ondemand.step_output",   // Outputs rail: {stepId, title, plugins[{pluginId,name,params}], raw}
  raw: "ondemand.raw", // raw OnDemand frame {event, data} — feeds the /chat-od-style status view (components/od-chat/raw-reducer.ts)
  plannerPayload: "ondemand.planner_payload", // unit1: planner/tool-definition JSON text split OUT of ondemand.thinking: {phase: planning|step, stepId, delta}
} as const satisfies Record<string, `ondemand.${string}`>;
/** Compile-time uniqueness guard: `_DuplicateClientEvent` is `never` while every CLIENT_EVENT value is distinct; a duplicate makes the line below fail tsc. */
type _CE = typeof CLIENT_EVENT;
type _DuplicateClientEvent = { [K in keyof _CE]: _CE[K] extends _CE[Exclude<keyof _CE, K>] ? K : never }[keyof _CE];
export const CLIENT_EVENT_VALUES_UNIQUE: [_DuplicateClientEvent] extends [never] ? true : never = true;
/** Voice phases carried by CE.voice (client-side; produced by the voice relay/shell, not by upstream SSE). */
export const VOICE_PHASE = ["transcript", "tts_queued", "tts_playing", "tts_done", "barge_in"] as const;
export type VoicePhase = (typeof VOICE_PHASE)[number];

/**
 * MEDIA_EVENT — client-side names for the Media API side (docs/ONDEMAND_CONTRACTS.md, media flow). These are NOT upstream SSE frames:
 * the /api/media relay answers an HTTP POST (upload → extract) and the shell's attachmentsStore raises one of these into the stream store
 * so RunRail / AttachmentBar can bind to a single name. `created` = media object exists (mediaId), `extracted` = text extraction finished
 * (extractedChars known), `failed` = upload or extraction error (message).
 */
export const MEDIA_EVENT = { created: "media.created", extracted: "media.extracted", failed: "media.failed" } as const;

/**
 * UPSTREAM_UNKNOWN_POLICY — any `eventType` (or `statusType` / agent subtype) NOT bound in the tables above still flows through
 * parseFrame → {kind:"unknown", eventType, raw} → bridge CUSTOM CE.unknown → chat shell, where it is rendered inside the RunRail developer
 * disclosure. Unseen upstream names are therefore surfaced, never dropped and never thrown on; binding them is a one-line edit here.
 */
export const UPSTREAM_UNKNOWN_POLICY = "fallthrough:unknown→CE.unknown→dev-disclosure" as const;

/** User-facing wording for the live line (the UX doc: first-person labels, one word for reasoning). */
export const LABEL = {
  thinking: "Thinking",
  working: "Working…",
  summarising: (n: number) => `Summarising step ${n}`,
  searching: (plugin: string) => `Searching with ${plugin}`,
  searched: (plugin: string, n: number) => `${plugin} searched · ${n} source${n === 1 ? "" : "s"}`,
  failed: (plugin: string) => `${plugin} failed`,
  /** Action-style label drawn BEFORE the action resolves (UX spec: "Searching the web", "Gathering news, prices and indicators"). */
  action: (plugin: string) => (/perplexity|search|google|bing|tavily|exa|serp|web/i.test(plugin) ? "Searching the web" : /news/i.test(plugin) ? "Gathering the latest news" : /stock|market|price|finance|yahoo/i.test(plugin) ? "Gathering prices and indicators" : /linkedin|reddit|x search|twitter|social/i.test(plugin) ? "Reading social signals" : /pitchbook|crunchbase|investor/i.test(plugin) ? "Looking up deal data" : /mail|email|send/i.test(plugin) ? "Sending" : `Using ${plugin}`),
  /** Done row: "8 sources · 18.2 s" (never an empty box). */
  done: (sources: number | undefined, durationMs: number | undefined) => `${sources != null ? `${sources} source${sources === 1 ? "" : "s"}` : "done"}${durationMs ? ` · ${(durationMs / 1000).toFixed(1)} s` : ""}`,
} as const;

/* ---------------------------------------------------------------- unit1: thinking classifier + friendly plugin labels ------------------------ */
export type ThinkingDeltaClass = "prose" | "payload";
export type ThinkingPhase = "planning" | "step";
const PAYLOAD_MARKER_RE = /"pluginId"|"api_request_parameters"|"operationId"|"agentId"\s*:|\bchars each\b|"user_query"\s*:|"steps"\s*:\s*\[/;
/** Unquoted planner scaffolding inside *_thinking prose ("Plugin: perplexity, pluginId: plugin-…, identifier: rest_api." / "api_request_parameters: {…}"):
 *  a whole LINE that is tool-definition bookkeeping, not reasoning. Matched against the delta and against the current (last) line of the accumulated text. */
const PAYLOAD_LINE_RE = /(^|\n)\s*(?:plugin\s*:\s*[\w-]+\s*,\s*pluginid\s*:|pluginid\s*:\s*plugin-\d+|api_request_parameters\s*:|identifier\s*:\s*rest_api|operationid\s*:)/i;
/** A line that enumerates the planner's own response-schema fields ("Format: plugins array with pluginId, name, description, api_request_parameters,
 *  all_parameters_hydrated, dependencies, identifier.") is schema bookkeeping, not reasoning: ≥2 schema tokens on one line → payload. */
const SCHEMA_TOKEN_RE = /\b(pluginId|api_request_parameters|all_parameters_hydrated|operationId|user_query|plan_required|dependencies\b.*\bidentifier)\b/g;
/** `api_request_parameters` / `all_parameters_hydrated` / "chars each" never occur in genuine reasoning — one hit is enough; `pluginId` alone needs a second token. */
const STRONG_SCHEMA_TOKEN_RE = /api_request_parameters|all_parameters_hydrated|\bchars each\b/i;
/** a9 — planner reasoning ABOUT its own output format ("Place in current with empty dependencies.", "plugins array", "output schema",
 *  'Title: 3-4 words starting with a verb ending in "ing"'). Each entry is ONE cue category (counted once per line, however often it repeats),
 *  so a sentence that merely mentions "the response schema" stays prose; ≥2 distinct categories on a line → payload. */
const FORMAT_CUE_RES: readonly RegExp[] = [
  /\b(?:response|output|plugins?|json) schema\b|\bschema (?:only )?(?:allows|requires|shows|says)\b/i,
  /\b["“]?plugins["”]? array\b/i,
  /\bcurrent(?:\/remaining)? array\b|\bremaining array\b|\bcurrent\/remaining\b|\bin current\b/i,
  /\b(?:empty |no )?dependencies\b/i,
  /\bformat (?:requires|says|is|wants)\b|\bjson output\b|\boutput json\b/i,
  /\b\d\s*-\s*\d words\b|\baction verb\b|\bverb ending\b|\bending in ["“]?ing\b|\bstarting with (?:an? )?verb\b/i,
  /\bidentifier\s*[:=]?\s*rest_api\b|\bidentifier field\b/i,
];
/** One of these alone is enough: nobody reasons about a task in these words. */
const STRONG_FORMAT_RE = /\bverb\b.{0,40}\bending in\b|\bending in ["“]?ing["”]?\b|\b\d\s*-\s*\d words\b.{0,40}\bverb\b|\bfollow(?:ing|s)? the (?:response|output|json) schema\b|\bplan_required\b\s*[:=]?\s*(?:true|false)\b|^\s*output (?:the )?json\.?\s*$|\bdependencies\s*[:=]\s*\[\s*\]/i;
const formatCueCount = (line: string): number => (STRONG_FORMAT_RE.test(line) ? 2 : 0) + FORMAT_CUE_RES.reduce((n, re) => n + (re.test(line) ? 1 : 0), 0);
const schemaTokenCount = (line: string): number => (STRONG_SCHEMA_TOKEN_RE.test(line) ? 2 : 0) + (line.match(SCHEMA_TOKEN_RE) ?? []).length + formatCueCount(line);
const PAYLOAD_OPEN_RE = /^\s*(?:```(?:json)?\s*)?[\[{]/;
/** Net brace/bracket depth of `text` ignoring characters inside JSON strings (so prose inside a payload never closes it early). */
export function jsonDepth(text: string): number {
  let depth = 0, inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === "{" || c === "[") depth++; else if (c === "}" || c === "]") depth = Math.max(0, depth - 1);
  }
  return depth;
}
/**
 * classifyThinkingDelta — PURE. Labels one reasoning delta as `prose` (model reasoning, belongs in the Thinking block) or `payload`
 * (plan / tool-definition JSON, truncation markers like "… 2048 chars each", fenced ```json blocks — belongs in the Outputs disclosure).
 *   kind            upstream eventType / channel: planning_output + step_output (and the adapter's "plan"/"step_output") are ALWAYS payload.
 *   accumulatedText everything of this channel received so far INCLUDING `delta` (the caller appends before classifying); used to keep a
 *                   multi-delta JSON block together: while an opened `{`/`[`/``` block is still unbalanced, every delta inside it is payload.
 * Heuristics: delta starts with `{` / `[` / ```json; carries "pluginId" / "api_request_parameters" / "operationId" / "chars each"; or sits inside
 * a still-open balanced-brace JSON block of the accumulated text. Plain sentences (even ones mentioning JSON or a plugin name) stay prose.
 */
export function classifyThinkingDelta(kind: string, accumulatedText: string, delta?: string): ThinkingDeltaClass {
  if (kind === "planning_output" || kind === "step_output" || kind === "plan") return "payload";
  const d = delta ?? accumulatedText;
  if (PAYLOAD_MARKER_RE.test(d)) return "payload";
  if (PAYLOAD_OPEN_RE.test(d)) return "payload";
  if (PAYLOAD_LINE_RE.test(d)) return "payload";
  if (delta != null) { const curLine = (accumulatedText.slice(accumulatedText.lastIndexOf("\n") + 1)); if (schemaTokenCount(curLine) >= 2) return "payload"; }
  else if (schemaTokenCount(d) >= 2) return "payload";
  // the delta continues a scaffolding line that started earlier ("Plugin: perplexity, pluginId: plu" + "gin-1722260873, identifier…")
  if (delta != null) { const lastLine = accumulatedText.slice(accumulatedText.lastIndexOf("\n") + 1); if (PAYLOAD_LINE_RE.test("\n" + lastLine) && !/\n/.test(delta)) return "payload"; }
  const before = delta != null && accumulatedText.endsWith(delta) ? accumulatedText.slice(0, accumulatedText.length - delta.length) : "";
  if (before) {
    // inside an open fence → payload until the closing ``` arrives
    const fences = (before.match(/```/g) ?? []).length;
    if (fences % 2 === 1) return "payload";
    // inside an unbalanced brace block that began at a line start → payload (keeps a streamed JSON object together across deltas)
    const lastOpen = Math.max(before.lastIndexOf("\n{"), before.lastIndexOf("\n["), before.startsWith("{") || before.startsWith("[") ? 0 : -1);
    if (lastOpen >= 0 && jsonDepth(before.slice(lastOpen)) > 0) return "payload";
  }
  return "prose";
}
/** Which Outputs bucket a payload delta belongs to (planning JSON vs per-step tool definitions). */
export const thinkingPhaseOf = (kind: string): ThinkingPhase => (/^planning|^plan$/.test(kind) ? "planning" : "step");

/** Human-readable plugin label for run-view chips/pills. Keyed by lowercase id OR name; fallback = catalogue name or the raw id. */
export const PLUGIN_LABEL: Record<string, string> = {
  executeprompt: "OnDemand Agent", ondemand_agent: "OnDemand Agent", "ondemand terminal agent": "OnDemand Agent", "ondemand agent": "OnDemand Agent", terminal_agent: "OnDemand Agent",
  perplexity: "Web search (Perplexity)", "plugin-1722260873": "Web search (Perplexity)",
  linkedin: "LinkedIn", "linkedin search": "LinkedIn", "plugin-1718116202": "LinkedIn",
  reddit: "Reddit", "reddit posts": "Reddit", "plugin-1748003575": "Reddit",
  x: "X search", twitter: "X search", "x search agent": "X search", "plugin-1751872652": "X search", "plugin-1785777296": "X search",
  gpt_search: "GPT search", "gpt search": "GPT search", google: "GPT search", "plugin-1741871229": "GPT search", internet: "GPT search", "plugin-1713924030": "GPT search",
  pitchbook: "PitchBook", "plugin-1777018662": "PitchBook",
  media: "Document reader", document: "Document reader", document_reader: "Document reader", media_reader: "Document reader", "document reader": "Document reader", pdf: "Document reader",
};
export function pluginLabel(idOrName: string | null | undefined, catalogueName?: (id: string) => string): string {
  const raw = String(idOrName ?? "").trim();
  if (!raw) return "Plugin";
  const k = raw.toLowerCase();
  if (PLUGIN_LABEL[k]) return PLUGIN_LABEL[k];
  if (/media|document|docx?|pdf|file.?reader/.test(k)) return "Document reader";
  if (/perplexity/.test(k)) return "Web search (Perplexity)";
  if (/pitchbook/.test(k)) return "PitchBook";
  if (/linkedin/.test(k)) return "LinkedIn";
  if (/reddit/.test(k)) return "Reddit";
  if (/^x[\s_-]|twitter/.test(k)) return "X search";
  if (/gpt.?search|google/.test(k)) return "GPT search";
  if (/executeprompt|ondemand.?(terminal.?)?agent/.test(k)) return "OnDemand Agent";
  if (catalogueName) { const n = catalogueName(raw); if (n && n !== raw) { const nk = n.toLowerCase(); return PLUGIN_LABEL[nk] ?? n; } }
  return raw;
}
/* end unit1 */
