# Interactive cards — wiring check (Agent 11, Team A, 2026-10-10)

Scope: `ondemand_agent.awaiting_input`, `ondemand_agent.require_creds`, `ondemand_agent.awaiting_browser_action`.
Files read: `src/lib/ondemand/eventMap.ts`, `src/lib/ondemand/sse-adapter.ts`, `src/app/api/chat/route.ts`,
`src/components/chat/open-intelligent-ui/chat-shell.tsx`, `src/app/api/chat/creds/route.ts`, `e2e/perf/mock-sse.mjs`.

## Verdict

**Verified by code path and by fixture frames, not by live frame — OnDemand did not emit any `agent` / `ondemand_agent.*` frame
this session** (trace `sse-trace.raw.log`: only `thinking|message|heartbeat`; see `sse-event-families.json`). The complete chain
exists for all three families; the only gap is that nothing (bridge or shell) ever calls `markPluginAuthorized`, so the
`authorized` plugin state has no live producer yet (`/api/chat/creds/route.ts` is outside this agent's edit scope).

## Chain per family

| upstream frame (`event:agent`, `eventType`) | eventMap binding | adapter `UiEvent.kind` | bridge CUSTOM frame (`route.ts dispatch`) | shell state → card | relay back to OnDemand |
|---|---|---|---|---|---|
| `ondemand_agent.awaiting_input` `data{prompt\|content\|question\|message, options[]}` | `AGENT_PREFIX="ondemand_agent."` + `AGENT_SUBTYPE.awaiting_input → "awaiting_input"` | `{kind:"awaiting_input", prompt, options?, agent}` | `CE.awaitingInput = "ondemand.awaiting_input"` `{prompt, options, agent}` + `ondemand.status {phase:"awaiting-input", statusType:"awaiting_input"}` | `chat-shell.tsx:139` → `st.prompt = {kind:"awaiting_input", prompt, options}` → `PromptCard` default branch → `<form data-testid="clarification-form">` with option chips + free-text input | `onAnswer(text)` → `setStream({prompt:null})` → `processMessage({role:"user", content})` → **next POST /api/chat turn on the same `sessionId`** (the answer is sent as the next user query, which is what the submit-query v1 resume contract expects). No `/api/chat/creds` involvement. |
| `ondemand_agent.require_creds` `data{pluginId, service, fields[{key,label,type}]}` | `AGENT_SUBTYPE.require_creds → "require_creds"` | `{kind:"require_creds", pluginId?, service?, fields[], agent}` | `CE.requireCreds = "ondemand.require_creds"` `{pluginId, service, fields, agent}` + status `awaiting-input/require_creds` | `chat-shell.tsx:140` → `st.prompt = {kind:"require_creds", pluginId, service, fields}` → `PromptCard` creds branch → `<form data-testid="creds-form">`, password inputs for keys matching `/secret\|token\|key\|password/i` or `type==="password"` | `submit(cancelled)` → **`POST /api/chat/creds` `{sessionId, pluginId, cancelled, fields:[{key,value}]}`** → `creds/route.ts` validates `sessionId` (`^[A-Za-z0-9]+$`), uses `messageId ?? "latest"`, forwards server-side with the apikey to `POST {BASE}/chat/v1/client/sessions/{sessionId}/messages/{mid}/tool-credentials` with body `{pluginId, fields}` or `{pluginId, cancelled:true}`; returns `{ok,status}` (200 / 502). Values never logged or stored; card shows `data-testid="prompt-done"`. **Gap:** the shell never passes `messageId` (always `"latest"`), and nothing calls `markPluginAuthorized`. |
| `ondemand_agent.awaiting_browser_action` `data{action, novncUrl\|url, message\|content}` | `AGENT_SUBTYPE.awaiting_browser_action → "awaiting_browser_action"` | `{kind:"awaiting_browser_action", action?, message?, url?, agent}` | `CE.awaitingBrowserAction = "ondemand.awaiting_browser_action"` `{action, message, url, agent}` + status `awaiting-input/awaiting_browser_action` | `chat-shell.tsx:141` → `st.prompt = {kind:"awaiting_browser_action", action, message, url}` → `PromptCard` approve branch → `<div data-testid="approval-card">` with "Open live browser" link (`url`, `target=_blank noopener`) + Done / Cancel | Done → `onAnswer("Done — I completed the browser action.")`; Cancel → `onAnswer("Cancel the browser action.")` → both become the **next user turn on the same session**. No `/api/chat/creds` involvement (correct — it is not a credential). |

Shared mechanics:
* `parseFrame(ev, data)` enters the agent branch when `ev === "agent"` **or** `eventType` starts with `ondemand_agent.` — so the
  bindings work whether OnDemand labels the SSE channel `agent` or sends the subtype on `message`.
* Unknown subtypes fall to `{kind:"agent"}` → `ondemand.agent` → rail log (`agentLog`) — never dropped.
* `PromptCard` is rendered only while `live && st.prompt` (`chat-shell.tsx:417`); every CUSTOM handler sets `phase:"awaiting-input"`.
* The card is closed (`prompt:null`) when answered; there is no timeout.

## Proof runs (no browser)

1. **Adapter parse check** — `proof/team-a/adapter-parse-check.json`: `parseFrame()` (transpiled `eventMap.ts` + `sse-adapter.ts`) on
   synthetic `agent` frames for all three subtypes returns the expected kinds with `pluginId/service/fields`, `prompt/options`,
   `action/url/message` populated; a documented `statusLog summarize_history.completed` frame returns `summary_done` — so the
   dormant binding still works should OnDemand ship it.
2. **Mock fixture** — `e2e/perf/mock-sse.mjs` is a plain node `http` server (port 3404, AG-UI frames, no deps). Ran it and curled it:
   * query containing `creds` → emits `CUSTOM ondemand.require_creds {pluginId:"plugin-1716429542", service:"US Stock Fundamentals",
     fields:[{key:"api_key",label:"API key",type:"password"}]}` at +4.6 s.
   * query containing `ask|clarif` → emits `CUSTOM ondemand.awaiting_input {prompt:"Should the ranking weight…", options:[3]}`.
   * Frames captured in `proof/team-a/mock-fixture-frames.log`. These are the exact `CLIENT_EVENT` names the shell switches on,
     so the fixture exercises shell lines 139/140 → `creds-form` / `clarification-form`. The fixture has **no**
     `ondemand.awaiting_browser_action` case, so that card is verified by code path only.
   * The fixture speaks the *client* contract (AG-UI), not the *upstream* one — it does not exercise `parseFrame`; item 1 covers that.
3. **Live** — `sse-trace.raw.log`: zero `event:agent` frames; OnDemand's deepseek-flash + GPT/X-search run never reached an agent
   interaction. Statement for the record: **verified by code path, not by live frame (OnDemand did not emit one this session).**

## Observations / follow-ups (not changed — outside scope or needs a decision)

* `creds/route.ts` relays to `/messages/{messageId|latest}/tool-credentials`; the shell never captures the upstream `messageId`
  (it is present on every upstream frame, e.g. `6aca0a8a261cbe2340484666`) — passing it instead of `latest` would be more precise.
* After a successful `POST /api/chat/creds`, calling `markPluginAuthorized(pluginId)` (now exported from `plugin-catalogue.ts`) would
  light the `authorized` badge; the relay route owner should add that one line.
* `awaiting_input` with `inputType:"choice"` is rendered as chips; `inputType:"password"/"otp"` (per the platform marker contract) is
  rendered as a plain text input — a `type=password` input for those would be safer.
