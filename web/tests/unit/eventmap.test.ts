/**
 * eventmap.test.ts — fixture tests for the OnDemand eventMap / SSE adapter bindings. Run with tsx (no framework):
 *   cd web && npm run test:eventmap      (= node ../node_modules/tsx/dist/cli.mjs tests/unit/eventmap.test.ts)
 * Payload shapes come from web/proof/team-a/sse-event-families.json (session 6aca0a89261cbe2340484665) and the submit-query v1 reference.
 * Exits non-zero on any failure.
 */
import { parseFrame, classifyClientFrame, isPlannerPayloadFrame } from "../../src/lib/ondemand/sse-adapter";
import { makeFrameGuard, splitSseLines, isTerminal, coalesceThinking } from "../../src/lib/ondemand/frame-guard";
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


{
  const c = (kind: string, acc: string, delta?: string) => classifyThinkingDelta(kind, acc, delta);
  // turn-4 regression (live run 10:31Z): unquoted scaffolding lines inside *_thinking prose are payload, surrounding reasoning stays prose
  eq("unquoted 'Plugin: perplexity, pluginId: plugin-…' line → payload", c("planning_thinking", "One step plan.\n\nPlugin: perplexity, pluginId: plugin-1722260873, identifier: rest_api.", "\n\nPlugin: perplexity, pluginId: plugin-1722260873, identifier: rest_api."), "payload");
  eq("continuation of a scaffolding line → payload", c("planning_thinking", "Plugin: perplexity, pluginId: plu", "gin-1722260873, identifier: rest_api."), "payload");
  eq("'api_request_parameters: {…}' line → payload", c("planning_thinking", "x\n\napi_request_parameters: {\"message\": \"In one sentence\"}", "\n\napi_request_parameters: {\"message\": \"In one sentence\"}"), "payload");
  eq("reasoning sentence mentioning the word plugin stays prose", c("planning_thinking", "Use the perplexity plugin. Keep it minimal — one step.", " Keep it minimal — one step."), "prose");
  eq("'Format: plugins array with pluginId, …, api_request_parameters, …' line → payload", c("planning_thinking", "x\n\nFormat: plugins array with pluginId, name, description, api_request_parameters, all_parameters_hydrated, dependencies, identifier.", ", all_parameters_hydrated, dependencies, identifier."), "payload");
  eq("single schema word in prose stays prose", c("planning_thinking", "Note the plugins schema mentions \"current\" array but the response schema shows \"plugins\".", " but the response schema shows \"plugins\"."), "prose");
  eq("bare 'api_request_parameters' mid-sentence → payload", c("step_thinking", "I need to fill api_request_parameters with the query", " with the query"), "payload");
  eq("title line stays prose", c("planning_thinking", "Title: \"Searching Fervo Energy's business\"", "Title: \"Searching Fervo Energy's business\""), "prose");
}

console.log("a7: frame guard (dedupe / gap / stale)");
{
  const g = makeFrameGuard();
  eq("guard: first seq ok", g.accept(1), "ok");
  eq("guard: next seq ok", g.accept(2), "ok");
  eq("guard: exact duplicate seq → dup", g.accept(2), "dup");
  eq("guard: seq jump 2→5 → gap", g.accept(5), "gap");
  eq("guard: out-of-order 3 < 5 → stale", g.accept(3), "stale");
  eq("guard: replayed stale seq is a dup", g.accept(3), "dup");
  eq("guard: stats dup/gap/stale/missing", [g.stats.dup, g.stats.gap, g.stats.stale, g.stats.missing, g.stats.lastSeq], [2, 1, 1, 2, 5]);
  const k = makeFrameGuard();
  eq("guard: no seq, key dedupe", [k.accept(undefined, "m1:1"), k.accept(undefined, "m1:1"), k.accept(undefined, "m1:2")], ["ok", "dup", "ok"]);
  g.reset();
  eq("guard: reset clears state", [g.stats.total, g.accept(2)], [0, "ok"]);
}
console.log("a7: SSE line splitting");
{
  const crlf = splitSseLines("event: thinking\r\ndata: {\"a\":1}\r\n\r\nevent: message\r\ndata: [DONE]\r\n\r\n");
  eq("split: CRLF → 2 frames with event names", crlf.frames.map((f) => [f.event, f.data]), [["thinking", "{\"a\":1}"], ["message", "[DONE]"]]);
  eq("split: CRLF leaves empty rest", crlf.rest, "");
  const multi = splitSseLines("data: line one\ndata: line two\ndata:\n\n");
  eq("split: multi-line data joins with \\n", multi.frames[0]?.data, "line one\nline two\n");
  const cmt = splitSseLines(": keep-alive\n: another\n\ndata: x\n\n");
  eq("split: comment-only block ignored, data frame kept", cmt.frames.map((f) => f.data), ["x"]);
  const partial = splitSseLines("data: done\n\ndata: {\"half\":");
  eq("split: unterminated tail returned as rest", [partial.frames.length, partial.rest], [1, "data: {\"half\":"]);
  const idr = splitSseLines("id: 7\nretry: 3000\nevent: heartbeat\ndata: {}\n\n");
  eq("split: id/retry/event parsed", [idr.frames[0]?.id, idr.frames[0]?.retry, idr.frames[0]?.event], ["7", 3000, "heartbeat"]);
  eq("split: lone CR line endings", splitSseLines("data: a\rdata: b\r\r").frames[0]?.data, "a\nb");
}
console.log("a7: terminal markers + coalesce");
{
  eq("isTerminal [DONE]", isTerminal("[DONE]"), "done");
  eq("isTerminal [DONE] padded", isTerminal("  [DONE]\n"), "done");
  eq("isTerminal [ERROR]: prefix", isTerminal("[ERROR]: {\"message\":\"boom\"}"), "error");
  eq("isTerminal plain json → null", isTerminal("{\"eventType\":\"fulfillment\"}"), null);
  const merged = coalesceThinking([{ channel: "planning", delta: "A" }, { channel: "planning", delta: "B" }, { channel: "step", stepId: "1", delta: "C" }, { channel: "step", stepId: "1", delta: "" }, { channel: "step", stepId: "1", delta: "D" }, { channel: "step", stepId: "2", delta: "E" }]);
  eq("coalesce: consecutive same-channel merged, stepId respected", merged.map((m) => [m.channel, m.stepId ?? "", m.delta]), [["planning", "", "AB"], ["step", "1", "CD"], ["step", "2", "E"]]);
}
console.log("a7: parseFrame hardening");
{
  const bad = parseFrame("message", "{not json");
  check("malformed JSON → unknown (never throws)", bad.kind === "unknown" && bad.eventType === "unparseable", bad);
  const arr = parseFrame("message", "[1,2,3]");
  check("JSON array payload → unknown", arr.kind === "unknown", arr);
  check("[DONE] with whitespace/BOM → done", parseFrame("message", "\uFEFF [DONE] \n").kind === "done");
  const err = parseFrame("message", "[ERROR]: {\"message\":\"quota\",\"errorCode\":\"E42\"}");
  check("[ERROR]: json → error with code", err.kind === "error" && err.code === "E42" && err.message === "quota", err);
  const nested = parseFrame("message", J({ data: { ...S, eventType: "fulfillment", answer: "hi" } }));
  check("nested data.eventType envelope → answer", nested.kind === "answer" && nested.delta === "hi", nested);
  const po = parseFrame("thinking", J({ ...S, eventType: "planning_output", output: { delta: "{\"steps\":[" } }));
  check("planning_output → planner frame, channel plan", po.kind === "thinking" && po.channel === "plan" && po.planner === true && po.delta === "{\"steps\":[", po);
  const so = parseFrame("thinking", J({ ...S, eventType: "step_output", stepId: "2", output: { delta: "{\"pluginId\"" } }));
  check("step_output → planner frame, channel step_output, stepId 2", so.kind === "thinking" && so.channel === "step_output" && so.planner === true && so.stepId === "2", so);
  const pt = parseFrame("thinking", J({ ...S, eventType: "planning_thinking", thinking: { delta: "hmm" } }));
  check("planning_thinking is NOT a planner frame", pt.kind === "thinking" && pt.planner === undefined && pt.channel === "planning", pt);
  const hb1 = parseFrame("heartbeat", J({ ...S, time: "2026-10-11T00:00:00Z" }));
  const hb2 = parseFrame("message", J({ ...S, eventType: "heartbeat", time: "2026-10-11T00:00:01Z" }));
  const hb3 = parseFrame("", J({ ...S, time: "2026-10-11T00:00:02Z" }));
  check("heartbeat: event name / eventType / bare time all → heartbeat", hb1.kind === "heartbeat" && hb2.kind === "heartbeat" && hb2.time === "2026-10-11T00:00:01Z" && hb3.kind === "heartbeat", [hb1, hb2, hb3]);
}
console.log("a9: planner format-reasoning lines (mined from proof/stream-audit/upstream-multistep.sse) → payload; task reasoning stays prose");
{
  const c = (kind: string, acc: string, delta?: string) => classifyThinkingDelta(kind, acc, delta);
  const line = (kind: string, l: string) => c(kind, "Reasoning so far.\n" + l, l);
  // positives — the planner talking about its own response format
  eq("a9 'Title: … 3-4 words starting with a verb ending in \"ing\"' → payload", line("step_thinking", "Title: \"Searching Fervo news\" — 3-4 words starting with a verb ending in \"ing\"."), "payload");
  eq("a9 'action verb ending in \"ing\", 3-4 words' → payload", line("step_thinking", "Let me build the title: \"Comparing momentum across fintechs\" - action verb ending in \"ing\", 3-4 words."), "payload");
  eq("a9 'Place in current with empty dependencies.' → payload", line("step_thinking", "Place in current with empty dependencies."), "payload");
  eq("a9 'I'll set up a perplexity call in current with empty dependencies.' → payload", line("step_thinking", "I'll set up a perplexity call in current with empty dependencies."), "payload");
  eq("a9 'Follow the response schema.' → payload", line("planning_thinking", "Follow the response schema."), "payload");
  eq("a9 'plan_required true' → payload", line("planning_thinking", "plan_required true, no clarification needed."), "payload");
  eq("a9 'format requires a JSON output with plugins array' → payload", line("step_thinking", "Hmm, but the format requires a JSON output with plugins array."), "payload");
  eq("a9 'placed in the current array with dependencies: []' → payload", line("step_thinking", "\"If you select any plugins, at least one MUST be placed in the current array with dependencies: [].\""), "payload");
  eq("a9 'output schema is just a single \"plugins\" array (not current/remaining)' → payload", line("step_thinking", "So the output schema is just a single \"plugins\" array (not current/remaining)."), "payload");
  eq("a9 bare 'Output JSON.' line → payload", line("planning_thinking", "Output JSON."), "payload");
  eq("a9 streamed continuation of a format line → payload", c("step_thinking", "x\nPlace in current with empty dependencies.", "dencies."), "payload");
  // negatives — genuine task reasoning that happens to use ordinary words
  eq("a9 'Use the perplexity plugin with a query.' stays prose", line("step_thinking", "Use the perplexity plugin with a query."), "prose");
  eq("a9 'Current date is 2026-10-11, so October 2026 is current month.' stays prose", line("step_thinking", "Current date is 2026-10-11, so October 2026 is current month."), "prose");
  eq("a9 'rule 8 says no summarizing/analysis steps' stays prose", line("planning_thinking", "Then a synthesis step — but rule 8 says no summarizing/analysis steps... the user explicitly asks for a summary."), "prose");
  eq("a9 single schema mention stays prose", line("step_thinking", "The rules: use llm_knowledge if none of the plugins are suitable for the questions asked."), "prose");
  eq("a9 'Fervo's Cape Station has no dependencies on gas pricing' stays prose", line("fulfillment_thinking", "Fervo's Cape Station has no dependencies on gas pricing, which supports the momentum case."), "prose");
  eq("a9 title with a company name stays prose", line("step_thinking", "Step 1: Gather recent Fervo Energy news (perplexity)"), "prose");
}
{
  // a42 — regressions replayed from REAL recordings: web/proof/stream-audit/upstream-multistep.sse (session 6acb474320a8b245e6aaad9e, 2026-10-11 08:22Z)
  // and the bridge-side CUSTOM frame names in web/proof/unit1/stream-after3.ndjson. Additive; frames are verbatim (long fields trimmed).
  const R = { sessionId: "6acb474320a8b245e6aaad9e", messageId: "6acb474420a8b245e6aaada1", status: "processing" };
  // 1. heartbeat frame has NO eventType, only {time} → heartbeat (never "unknown", never thinking)
  const hb = parseFrame("heartbeat", J({ sessionId: R.sessionId, messageId: R.messageId, time: "2026-10-11T08:22:31Z" }));
  eq("recording: event:heartbeat without eventType → heartbeat with time", hb, { kind: "heartbeat", time: "2026-10-11T08:22:31Z" });
  // 2. same payload arriving on the default channel (event name omitted by a proxy) still classifies as heartbeat via the time field
  eq("recording: heartbeat payload on '' channel → heartbeat", parseFrame("", J({ sessionId: R.sessionId, messageId: R.messageId, time: "2026-10-11T08:22:34Z" })).kind, "heartbeat");
  // 3. plugin_sources with 4 items (eventIndex 174) → sources with pluginId/pluginName/stepTitle and imageUrl carried through
  const srcFrame = { ...R, eventIndex: 174, eventType: "plugin_sources", stepId: "1", stepTitle: "Searching Fervo Energy news", sources: { agentId: "agent-1722260873", pluginId: "plugin-1722260873", pluginName: "Perplexity", operationId: "perplexity", items: [
    { title: "2026 Climate Tech Companies to Watch: Fervo Energy and its plan to streamline geothermal power | MIT Technology Review", url: "https://www.technologyreview.com/2026/10/06/1145252/fervo-energy-geothermal-power-streamline-plan/", domain: "technologyreview.com", imageUrl: "https://wp.technologyreview.com/wp-content/uploads/2026/10/New-Fervo-Energy-Power-Plant-and-Drilling-Rig.jpg" },
    { title: "What's behind Fervo's half-billion-dollar Series E | Latitude Media", url: "https://www.latitudemedia.com/news/whats-behind-fervos-half-billion-dollar-series-e/", domain: "latitudemedia.com" },
    { title: "no url item is dropped", domain: "example.com" },
    { title: "Fervo Energy | Crunchbase", url: "https://www.crunchbase.com/organization/fervo-energy" } ] } };
  const src = parseFrame("message", J(srcFrame));
  check("recording: plugin_sources (eventIndex 174) → sources, pluginId plugin-1722260873, stepTitle kept", src.kind === "sources" && src.pluginId === "plugin-1722260873" && src.pluginName === "Perplexity" && src.stepId === "1" && src.stepTitle === "Searching Fervo Energy news", src);
  check("recording: sources items — url-less item dropped, domain → sourceName, imageUrl kept, hostname fallback strips www.", src.kind === "sources" && src.items.length === 3 && src.items[0].sourceName === "technologyreview.com" && src.items[0].imageUrl?.startsWith("https://wp.technologyreview.com/") && src.items[2].sourceName === "crunchbase.com", src.kind === "sources" ? src.items : src);
  eq("recording: plugin_sources pluginId → pluginLabel Web search (Perplexity)", src.kind === "sources" ? pluginLabel(src.pluginId ?? "") : "", "Web search (Perplexity)");
  // 4. fulfillment delta (eventIndex 459; note the spaced-out JSON keys exactly as upstream sent them) → answer delta verbatim
  const ful = parseFrame("message", '{"sessionId": "6acb474320a8b245e6aaad9e", "messageId": "6acb474420a8b245e6aaada1", "answer": "# Fervo Energy vs. Flutterwave", "status": "processing", "eventIndex":459, "eventType": "fulfillment"}');
  eq("recording: fulfillment (eventIndex 459) → answer delta verbatim", ful, { kind: "answer", delta: "# Fervo Energy vs. Flutterwave" });
  // 5. metricsLog publicMetrics (eventIndex 683) → metrics with the six numeric fields intact
  const met = parseFrame("message", J({ ...R, eventIndex: 683, eventType: "metricsLog", publicMetrics: { inputTokens: 10787, outputTokens: 2098, totalTokens: 12885, ragTimeSec: 35.53, fulfillmentTimeSec: 9.67, totalTimeSec: 45.2 } }));
  check("recording: metricsLog (eventIndex 683) → metrics, totals preserved", met.kind === "metrics" && met.publicMetrics.totalTokens === 12885 && met.publicMetrics.inputTokens + met.publicMetrics.outputTokens === met.publicMetrics.totalTokens && met.publicMetrics.totalTimeSec === 45.2, met);
  // 6. planning_output / step_output deltas (eventIndex 90 / 150) are planner payload: adapter channel plan/step_output, classifier → payload (this is what the bridge re-emits as CE.planner_payload)
  const po = parseFrame("thinking", J({ ...R, eventIndex: 90, eventType: "planning_output", output: { delta: "{\n  \"title\": \"I'll pull this month" } }));
  const so = parseFrame("thinking", J({ ...R, eventIndex: 150, eventType: "step_output", stepId: "1", output: { delta: "{\n  \"title\": \"Searching Fervo Energy" } }));
  check("recording: planning_output (eventIndex 90) → thinking/plan, classified payload", po.kind === "thinking" && po.channel === "plan" && classifyThinkingDelta("planning_output", po.delta, po.delta) === "payload", po);
  check("recording: step_output (eventIndex 150) → thinking/step_output with stepId 1, classified payload", so.kind === "thinking" && so.channel === "step_output" && so.stepId === "1" && classifyThinkingDelta("step_output", so.delta, so.delta) === "payload", so);
  // 7. planning_thinking prose deltas (eventIndex 1-3) stay prose and concatenate to the sentence the user saw
  const prose = ["The user wants a comparison of", " the latest news about Fervo Energy", " and Flutterwave this month (October"];
  let acc = ""; let allProse = true;
  prose.forEach((d, i) => { const u = parseFrame("thinking", J({ ...R, eventIndex: i + 1, eventType: "planning_thinking", thinking: { delta: d } })); if (u.kind !== "thinking" || u.channel !== "planning") allProse = false; acc += u.kind === "thinking" ? u.delta : ""; if (classifyThinkingDelta("planning_thinking", acc, d) !== "prose") allProse = false; });
  check("recording: planning_thinking deltas 1-3 → thinking/planning, all prose, concatenate verbatim", allProse && acc === "The user wants a comparison of the latest news about Fervo Energy and Flutterwave this month (October", acc);
  // 8. bridge CUSTOM frames seen in stream-after3.ndjson: planner_payload / heartbeat / step_output / sources / filler are all "known" client events; the planner_payload value shape is validated
  const names = ["ondemand.planner_payload", "ondemand.heartbeat", "ondemand.step_output", "ondemand.sources", "ondemand.filler", "ondemand.metrics", "ondemand.plan", "ondemand.step", "ondemand.status", "ondemand.session", "ondemand.request", "ondemand.thinking"];
  eq("recording: every CUSTOM name in stream-after3.ndjson classifies as known", names.map((n) => classifyClientFrame({ type: "CUSTOM", name: n })), names.map(() => "known"));
  eq("recording: CE.plannerPayload value {phase:planning, stepId, delta} passes isPlannerPayloadFrame", [isPlannerPayloadFrame({ phase: "planning", stepId: "", delta: "{\n  \"title\": \"I'll pull this month" }), isPlannerPayloadFrame({ phase: "step", stepId: "1", delta: "{\"title\":\"Searching" }), isPlannerPayloadFrame({ phase: "fulfillment", delta: "x" }), isPlannerPayloadFrame({ phase: "planning" })], [true, true, false, false]);
  eq("recording: RUN_STARTED / unknown CUSTOM name", [classifyClientFrame({ type: "RUN_STARTED" }), classifyClientFrame({ type: "CUSTOM", name: "ondemand.not_a_thing" })], ["known", "unknown"]);
}
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { console.error("FAILED:", failures.join("; ")); process.exit(1); }
