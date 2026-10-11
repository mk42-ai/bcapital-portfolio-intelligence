/**
 * eventmap.test.ts — fixture tests for the OnDemand eventMap / SSE adapter bindings. Run with tsx (no framework):
 *   cd web && npm run test:eventmap      (= node ../node_modules/tsx/dist/cli.mjs tests/unit/eventmap.test.ts)
 * Payload shapes come from web/proof/team-a/sse-event-families.json (session 6aca0a89261cbe2340484665) and the submit-query v1 reference.
 * Exits non-zero on any failure.
 */
import { parseFrame, classifyClientFrame } from "../../src/lib/ondemand/sse-adapter";
import { CLIENT_EVENT, MEDIA_EVENT, VOICE_PHASE, EVENT_TYPE, STATUS_TYPE, CLIENT_EVENT_VALUES_UNIQUE, classifyThinkingDelta, thinkingPhaseOf, pluginLabel, jsonDepth } from "../../src/lib/ondemand/eventMap";

let pass = 0; const failures: string[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => { if (ok) { pass++; console.log(`  ok   ${name}`); } else { failures.push(name); console.log(`  FAIL ${name}${detail !== undefined ? ` → ${JSON.stringify(detail)}` : ""}`); } };
const eq = (name: string, got: unknown, want: unknown) => check(name, JSON.stringify(got) === JSON.stringify(want), { got, want });
const S = { sessionId: "6aca0a89261cbe2340484665", messageId: "6aca0a8a261cbe2340484666", status: "processing" };
const J = (o: Record<string, unknown>) => JSON.stringify(o);

console.log("eventMap: upstream eventTypes observed this session (web/proof/team-a/sse-event-families.json)");
const observed: [string, string, Record<string, unknown>, string][] = [
  ["thinking", "planning_thinking", { ...S, eventIndex: 1, eventType: "planning_thinking", thinking: { delta: "The user wants to compare the latest" } }, "thinking"],
  ["thinking", "planning_output", { ...S, eventIndex: 61, eventType: "planning_output", output: { delta: "{\n  \"title\": \"I'll look up the" } }, "thinking"],
  ["thinking", "step_thinking", { ...S, eventIndex: 95, eventType: "step_thinking", stepId: "1", thinking: { delta: "The user wants the latest funding" } }, "thinking"],
  ["thinking", "step_output", { ...S, eventIndex: 99, eventType: "step_output", stepId: "1", output: { delta: "{\"title\":\"Searching Fervo Energy" } }, "thinking"],
  ["message", "plugin_sources", { ...S, eventIndex: 120, eventType: "plugin_sources", stepId: "1", stepTitle: "Searching Fervo Energy funding", sources: { pluginId: "plugin-1741871229", pluginName: "GPT Search", items: [{ url: "https://www.reuters.com/technology/fervo-energy-geothermal-2026", title: "Fervo Energy raises new round", domain: "reuters.com" }] } }, "sources"],
  ["thinking", "fulfillment_thinking", { ...S, eventIndex: 170, eventType: "fulfillment_thinking", thinking: { delta: "Provide comparison and summary" } }, "thinking"],
  ["message", "fulfillment", { ...S, eventIndex: 182, eventType: "fulfillment", answer: "## Fervo Energy vs. Ormat Technologies" }, "answer"],
  ["message", "metricsLog", { ...S, eventIndex: 249, eventType: "metricsLog", publicMetrics: { inputTokens: 6485, outputTokens: 743, totalTokens: 7228, ragTimeSec: 22.47, fulfillmentTimeSec: 3.34, totalTimeSec: 25.81 } }, "metrics"],
];
for (const [ev, et, payload, wantKind] of observed) {
  const u = parseFrame(ev, J(payload));
  check(`${ev}/${et} → kind ${wantKind} (not unknown)`, u.kind === wantKind && u.kind !== "unknown", u);
  check(`${et} is bound in EVENT_TYPE`, et in EVENT_TYPE);
}
{
  const u = parseFrame("thinking", J(observed[2][2]));
  check("step_thinking carries stepId + delta + channel step", u.kind === "thinking" && u.stepId === "1" && u.channel === "step" && u.delta.startsWith("The user"), u);
  const a = parseFrame("message", J(observed[6][2]));
  check("fulfillment delta preserved verbatim", a.kind === "answer" && a.delta === "## Fervo Energy vs. Ormat Technologies", a);
  const m = parseFrame("message", J(observed[7][2]));
  check("metricsLog publicMetrics.totalTokens = 7228", m.kind === "metrics" && m.publicMetrics.totalTokens === 7228, m);
  const s = parseFrame("message", J(observed[4][2]));
  check("plugin_sources → 1 citation with sourceName reuters.com, stepTitle kept", s.kind === "sources" && s.items.length === 1 && s.items[0].sourceName === "reuters.com" && s.stepTitle === "Searching Fervo Energy funding", s);
  const h = parseFrame("heartbeat", J({ sessionId: S.sessionId, messageId: S.messageId, time: "2026-10-10T09:51:09Z" }));
  check("heartbeat (no eventType) → heartbeat", h.kind === "heartbeat" && h.time === "2026-10-10T09:51:09Z", h);
}

console.log("eventMap: statusLog summarize_history pair still bound");
{
  const init = parseFrame("message", J({ ...S, eventType: "statusLog", currentStatusLog: { statusType: "summarize_history.initialized", statusMessage: "Summarising step 1", stepId: "2", stepIndex: 1 } }));
  const done = parseFrame("message", J({ ...S, eventType: "statusLog", currentStatusLog: { statusType: "summarize_history.completed", statusMessage: "Summary ready", stepId: "2", stepIndex: 1, summary: "Fervo closed a new Cape Station round." } }));
  check("summarize_history.initialized → summary_start index 1", init.kind === "summary_start" && init.index === 1 && init.stepId === "2", init);
  check("summarize_history.completed → summary_done with text", done.kind === "summary_done" && done.index === 1 && done.text === "Fervo closed a new Cape Station round.", done);
  eq("STATUS_TYPE binding summary_start", STATUS_TYPE["summarize_history.initialized"], "summary_start");
  eq("STATUS_TYPE binding summary_done", STATUS_TYPE["summarize_history.completed"], "summary_done");
  const pc = parseFrame("message", J({ ...S, eventType: "statusLog", currentStatusLog: { statusType: "plan_created", queryPlan: { objective: "Compare funding", steps: [{ id: "1", title: "Search Fervo" }, { id: "2", title: "Search Ormat" }] } } }));
  check("plan_created → plan with 2 steps", pc.kind === "plan" && pc.steps.length === 2 && pc.objective === "Compare funding", pc);
}

console.log("eventMap: agent interaction frames");
{
  const rc = parseFrame("agent", J({ eventType: "ondemand_agent.require_creds", agent: { id: "a1", name: "US Stock Fundamentals" }, data: { pluginId: "plugin-1716429542", service: "US Stock Fundamentals", fields: [{ key: "api_key", label: "API key", type: "password" }] } }));
  check("ondemand_agent.require_creds → require_creds with 1 field", rc.kind === "require_creds" && rc.fields.length === 1 && rc.fields[0].key === "api_key" && rc.pluginId === "plugin-1716429542", rc);
  const ai = parseFrame("agent", J({ eventType: "ondemand_agent.awaiting_input", agent: { id: "a1" }, data: { prompt: "Which flight?", options: ["6E 201", "AI 404"] } }));
  check("ondemand_agent.awaiting_input → awaiting_input with options", ai.kind === "awaiting_input" && ai.prompt === "Which flight?" && ai.options?.length === 2, ai);
  const ab = parseFrame("agent", J({ eventType: "ondemand_agent.awaiting_browser_action", data: { action: "payment", novncUrl: "https://novnc.example/x", message: "Pay in the live browser" } }));
  check("ondemand_agent.awaiting_browser_action → action payment + url", ab.kind === "awaiting_browser_action" && ab.action === "payment" && ab.url === "https://novnc.example/x", ab);
  const generic = parseFrame("agent", J({ eventType: "ondemand_agent.tool_call", data: { name: "shell" } }));
  check("ondemand_agent.tool_call → generic agent frame (rail log)", generic.kind === "agent" && generic.subtype === "tool_call", generic);
}

console.log("eventMap: terminal + unknown policy");
{
  eq("[DONE] → done", parseFrame("message", "[DONE]"), { kind: "done" });
  const u = parseFrame("message", J({ ...S, eventType: "totally_new_event", payload: { x: 1 } }));
  check("unseen eventType → kind unknown, eventType preserved (never dropped)", u.kind === "unknown" && u.eventType === "totally_new_event", u);
  const e = parseFrame("message", "[ERROR]: {\"message\":\"boom\",\"errorCode\":\"E1\"}");
  check("[ERROR]: prefix → error with code", e.kind === "error" && e.code === "E1" && e.message === "boom", e);
  const bad = parseFrame("message", "not json");
  check("unparseable data → unknown/unparseable (no throw)", bad.kind === "unknown" && bad.eventType === "unparseable", bad);
}

console.log("eventMap: CLIENT_EVENT / MEDIA_EVENT contract");
{
  const values = Object.values(CLIENT_EVENT);
  check("CLIENT_EVENT values unique", new Set(values).size === values.length, values);
  check("CLIENT_EVENT values all start with ondemand.", values.every((v) => v.startsWith("ondemand.")), values);
  check("CLIENT_EVENT_VALUES_UNIQUE type guard is true", CLIENT_EVENT_VALUES_UNIQUE === true);
  eq("CLIENT_EVENT.attachments", CLIENT_EVENT.attachments, "ondemand.attachments");
  eq("CLIENT_EVENT.voice", CLIENT_EVENT.voice, "ondemand.voice");
  eq("CLIENT_EVENT.unknown kept", CLIENT_EVENT.unknown, "ondemand.unknown");
  eq("MEDIA_EVENT", MEDIA_EVENT, { created: "media.created", extracted: "media.extracted", failed: "media.failed" });
  eq("VOICE_PHASE", [...VOICE_PHASE], ["transcript", "tts_queued", "tts_playing", "tts_done", "barge_in"]);
}

console.log("sse-adapter: classifyClientFrame");
{
  eq("CUSTOM ondemand.attachments → attachments", classifyClientFrame({ type: "CUSTOM", name: "ondemand.attachments", value: { items: [] } }), "attachments");
  eq("CUSTOM ondemand.voice → voice", classifyClientFrame({ type: "CUSTOM", name: "ondemand.voice", value: { phase: "transcript" } }), "voice");
  eq("TEXT_MESSAGE_CONTENT → known", classifyClientFrame({ type: "TEXT_MESSAGE_CONTENT" }), "known");
  eq("CUSTOM ondemand.nope → unknown", classifyClientFrame({ type: "CUSTOM", name: "ondemand.nope" }), "unknown");
  eq("CUSTOM ondemand.status → known", classifyClientFrame({ type: "CUSTOM", name: "ondemand.status" }), "known");
  eq("CUSTOM ondemand.unknown → known (bound dev-disclosure frame)", classifyClientFrame({ type: "CUSTOM", name: CLIENT_EVENT.unknown }), "known");
  eq("empty frame → unknown", classifyClientFrame({}), "unknown");
}


console.log("eventMap: 2026-10-11 raw upstream recording (web/proof/stream-audit/upstream-summary.json) — every observed eventType bound, no statusLog/summarize_history frame");
{
  const observedRaw = ["planning_thinking", "planning_output", "step_thinking", "step_output", "plugin_sources", "fulfillment_thinking", "fulfillment", "metricsLog"];
  for (const et of observedRaw) check(`raw-upstream eventType ${et} bound in EVENT_TYPE`, et in EVENT_TYPE);
  const S3 = { sessionId: "6acb474320a8b245e6aaad9e", messageId: "6acb474420a8b245e6aaada1", status: "processing" };
  const ps = parseFrame("message", J({ ...S3, eventIndex: 174, eventType: "plugin_sources", stepId: "1", stepTitle: "Searching Fervo Energy news", sources: { agentId: "agent-1722260873", pluginId: "plugin-1722260873", pluginName: "Perplexity", operationId: "search", items: [{ title: "Fervo Energy", url: "https://www.fervoenergy.com/news", domain: "fervoenergy.com", imageUrl: "" }] } }));
  check("raw plugin_sources (stepId 1, stepTitle) → sources with stepTitle + 1 item", ps.kind === "sources" && ps.stepTitle === "Searching Fervo Energy news" && ps.items.length === 1, ps);
  // The recording carries NO statusLog frame: a frame with only the top-level status:"processing" must NOT be mistaken for a summary_start/done.
  const st = parseFrame("thinking", J({ ...S3, eventIndex: 404, eventType: "step_output", stepId: "3", output: { delta: " and Lisa Su (shattered.io summary" } }));
  check("prose 'summary' inside a step_output delta stays kind thinking (not summary_*)", st.kind === "thinking" && st.channel !== undefined, st);
  const summarise = parseFrame("message", J({ ...S3, eventType: "statusLog", currentStatusLog: { statusType: "summarize_history.completed", summary: "x" } }));
  check("documented summarize_history.completed binding still intact (documented-only, unobserved 2026-10-11)", summarise.kind === "summary_done" && summarise.text === "x", summarise);
}

console.log("unit1: classifyThinkingDelta (prose vs planner payload) + pluginLabel");
{
  const c = (kind: string, acc: string, delta?: string) => classifyThinkingDelta(kind, acc, delta);
  eq("prose planning_thinking → prose", c("planning_thinking", "The user wants to compare the latest", "The user wants to compare the latest"), "prose");
  eq("prose mentioning JSON/plugins stays prose", c("step_thinking", "I will use the Perplexity plugin and parse the json response.", "I will use the Perplexity plugin and parse the json response."), "prose");
  eq("planning_output delta (plan JSON) → payload", c("planning_output", "{\n  \"title\": \"I'll look up the", "{\n  \"title\": \"I'll look up the"), "payload");
  eq("step_output delta (tool definition JSON) → payload", c("step_output", "{\"title\":\"Searching Fervo Energy", "{\"title\":\"Searching Fervo Energy"), "payload");
  eq("step_output prose-looking tail is STILL payload (channel rule)", c("step_output", "ing and returns relevant sources", "ing and returns relevant sources"), "payload");
  eq("adapter channel 'plan' → payload", c("plan", "{\"objective\":", "{\"objective\":"), "payload");
  eq("*_thinking delta starting with { → payload", c("step_thinking", "{\"pluginId\": \"plugin-1722260873\"", "{\"pluginId\": \"plugin-1722260873\""), "payload");
  eq("*_thinking delta starting with [ → payload", c("step_thinking", "[{\"name\":", "[{\"name\":"), "payload");
  eq("fenced ```json opener → payload", c("planning_thinking", "```json\n{", "```json\n{"), "payload");
  eq("delta inside an open fence → payload", c("planning_thinking", "Here is the plan:\n```json\n{\"steps\": [", "{\"steps\": ["), "payload");
  eq("delta after the fence closed → prose", c("planning_thinking", "```json\n{\"a\":1}\n```\nNow I will search.", "Now I will search."), "prose");
  eq("\"api_request_parameters\" marker → payload", c("step_thinking", ' "api_request_parameters": {"query"', ' "api_request_parameters": {"query"'), "payload");
  eq("\"operationId\" marker → payload", c("step_thinking", '"operationId": "search"', '"operationId": "search"'), "payload");
  eq("truncation marker '… 2048 chars each' → payload", c("step_thinking", "… 2048 chars each", "… 2048 chars each"), "payload");
  eq("delta continuing an unbalanced brace block → payload", c("step_thinking", "Plan:\n{\"plugins\": [{\"name\": \"perplexity\",\n \"description\": \"This endpoint allows query", " \"description\": \"This endpoint allows query"), "payload");
  eq("delta after the brace block balanced → prose", c("step_thinking", "Plan:\n{\"plugins\": []}\nProceeding to search now.", "Proceeding to search now."), "prose");
  eq("jsonDepth ignores braces in strings", jsonDepth('{"a": "}{"'), 1);
  eq("thinkingPhaseOf planning_output → planning", thinkingPhaseOf("planning_output"), "planning");
  eq("thinkingPhaseOf step_output → step", thinkingPhaseOf("step_output"), "step");
  eq("CLIENT_EVENT.plannerPayload bound", CLIENT_EVENT.plannerPayload, "ondemand.planner_payload");
  check("classifyClientFrame knows ondemand.planner_payload", classifyClientFrame({ type: "CUSTOM", name: CLIENT_EVENT.plannerPayload, value: { phase: "step", stepId: "1", delta: "{" } }) === "known");
  eq("pluginLabel executePrompt", pluginLabel("executePrompt"), "OnDemand Agent");
  eq("pluginLabel ondemand_agent", pluginLabel("ondemand_agent"), "OnDemand Agent");
  eq("pluginLabel 'OnDemand Terminal Agent'", pluginLabel("OnDemand Terminal Agent"), "OnDemand Agent");
  eq("pluginLabel perplexity", pluginLabel("perplexity"), "Web search (Perplexity)");
  eq("pluginLabel plugin-1722260873", pluginLabel("plugin-1722260873"), "Web search (Perplexity)");
  eq("pluginLabel linkedin", pluginLabel("linkedin"), "LinkedIn");
  eq("pluginLabel reddit", pluginLabel("reddit"), "Reddit");
  eq("pluginLabel x / twitter", [pluginLabel("x"), pluginLabel("twitter")], ["X search", "X search"]);
  eq("pluginLabel gpt_search / google", [pluginLabel("gpt_search"), pluginLabel("google")], ["GPT search", "GPT search"]);
  eq("pluginLabel pitchbook plugin-1777018662", pluginLabel("plugin-1777018662"), "PitchBook");
  eq("pluginLabel media/document → Document reader", [pluginLabel("media_reader"), pluginLabel("document-extractor")], ["Document reader", "Document reader"]);
  eq("pluginLabel fallback = catalogue name", pluginLabel("plugin-999", (id) => (id === "plugin-999" ? "Quarterly financial report data tool" : id)), "Quarterly financial report data tool");
  eq("pluginLabel fallback = raw id", pluginLabel("plugin-424242"), "plugin-424242");
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { console.error("FAILED:", failures.join("; ")); process.exit(1); }
