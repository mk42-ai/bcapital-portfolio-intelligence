# Session resume for interactive cards

When the OnDemand agent pauses a run with an interactive prompt (`clarification`, `awaiting_input`, `require_creds`,
`awaiting_browser_action`), the user's answer must continue the **same OnDemand session** — a new session would lose the
paused flow. This document records the exact path for all three card families.

Files: `web/src/components/chat/open-intelligent-ui/resume.ts` (client helper + ring buffer),
`web/src/app/api/chat/resume/route.ts` (non-streaming fallback), `messages.tsx` (`PromptCard onAnswer`),
`chat-shell.tsx` (fetch wrapper that injects `context.sessionId`), `web/src/app/api/chat/route.ts` (SSE bridge).

## Where the session id lives

| Layer | Key | Written by |
|---|---|---|
| live stream store | `streamState.sessionId` | `teeStream` on `CUSTOM ondemand.session`; `resumeSession()` re-pins it |
| per-thread memory | `sessionRef.current[threadId]` | chat-shell fetch wrapper (`remember`) |
| localStorage | `bcap.chat.session.v2.<threadId>` | `rememberSession(threadId, sessionId)` |
| pre-warm | `prewarm.current.sessionId` | `/api/chat/prewarm` on page load (first turn only) |

`getCurrentSessionId(ref, threadId)` = `ref[threadId] ?? localStorage ?? streamState.sessionId`.

## Upstream call (streaming path)

`web/src/app/api/chat/route.ts` reuses `ctx.sessionId` when the browser sends one (`/^[A-Za-z0-9]+$/`) and only creates a
session when it is absent. The resumed turn therefore goes to:

```
POST ${ONDEMAND_BASE_URL}/chat/v1/sessions/${sessionId}/query
headers: apikey (server), content-type: application/json, accept: text/event-stream
body:    { query, endpointId: "predefined-deepseek-flash", responseMode: "stream",
           pluginIds: [...], reasoningMode: "medium" }
```

The bridge echoes the session on the response header `x-ondemand-session` and the frame `CUSTOM ondemand.session {sessionId, created:false, viaHeader:true}`.

## Sequence — clarification / awaiting_input (streaming)

```
OnDemand ──SSE awaiting_input / clarification──▶ /api/chat ──CUSTOM ondemand.awaiting_input──▶ teeStream
   teeStream: setStream({ prompt:{kind:"awaiting_input",…}, phase:"awaiting-input" })
   PluginTimeline renders <PromptCard prompt sessionId={st.sessionId} onAnswer>
User picks an option / types ─▶ AwaitingInputCard ─▶ onAnswer(text)
   messages.tsx: setStream({ prompt:null }, true)
                 resumeSession(text, { sessionId: st.sessionId, kind, send: processMessage })
   resume.ts:    record {threadId, sessionId, kind, at, mode:"stream"} → getResumeLog()
                 setStream({ sessionId })                       (pin, if the card knows one)
                 return processMessage({ role:"user", content:text })
AgentInterface ─▶ POST /api/chat { threadId, messages, context }
   chat-shell wrapper: context.sessionId = sessionRef[tid] ?? localStorage ?? prewarm   (same thread → same id)
/api/chat ─▶ POST /chat/v1/sessions/{sessionId}/query (responseMode stream)   ── no session is created
OnDemand resumes the paused run; frames stream back into the same thread.
```

## Sequence — require_creds

```
OnDemand ──require_creds {pluginId, service, fields}──▶ /api/chat ──CUSTOM ondemand.require_creds──▶ teeStream → PromptCard
User fills the fields ─▶ RequireCredsCard ─▶ POST /api/chat/creds { sessionId, pluginId, fields }   (or {cancelled:true})
/api/chat/creds ─▶ POST /chat/v1/client/sessions/{sessionId}/messages/latest/tool-credentials (server key, values never logged)
OnDemand picks the run up on the SAME session (no new /query is needed). The card shows "sent"; the stream continues.
```

`require_creds` does not go through `resumeSession` because the OnDemand contract resumes the run from the credentials
relay itself; the only session id used is `st.sessionId` (the live stream's).

## Sequence — awaiting_browser_action (Done / Cancel)

```
OnDemand ──awaiting_browser_action {action, message, url}──▶ /api/chat ──CUSTOM──▶ teeStream → PromptCard → BrowserActionCard
User acts in the live browser (url opens in a new tab) and clicks Done (or Cancel)
   BrowserActionCard: onAnswer("Done — I completed the browser action.")
   → identical to the awaiting_input path above: resumeSession → processMessage → /api/chat with context.sessionId
       → POST /chat/v1/sessions/{sessionId}/query (stream)

Fallback — no thread open (e.g. the card is rendered outside AgentInterface, or the thread was closed):
   resume.ts resumeSync(text, { sessionId, kind })
   → POST /api/chat/resume { sessionId, text, kind, pluginIds? }
   → POST ${ONDEMAND_BASE_URL}/chat/v1/sessions/${sessionId}/query { query:text, endpointId, responseMode:"sync", pluginIds, reasoningMode }
   ← { ok:true, status:200, answer? }     | 400 { ok:false, error } bad shape
                                           | 503 no server key
                                           | 502 { ok:false, status:<upstream status>, error } upstream error / timeout
```

## `/api/chat/resume` validation

* JSON body required; `sessionId` `/^[A-Za-z0-9]{6,80}$/`; `text` non-empty, ≤ 8 000 chars; `kind` ∈ the four prompt kinds;
  `pluginIds` optional string array (filtered through `resolvePluginIds`, Perplexity pinned).
* Bad shape → **400** `{ok:false,status:400,error}`. Upstream non-2xx → **502** with `status` = the upstream HTTP status.
  Fetch failure → 502 `{status:0}`; 100 s timeout → 502 `{status:504}`.
* The answer text is never logged (no payload audit on this route).

## Dev disclosure

`getResumeLog()` (resume.ts) returns the last 20 `{ threadId, sessionId, kind, at, mode }` entries — never the text — so the
inspector can show that a card's answer continued session `X` rather than opening a new one.

## Tests

`web/e2e/session-resume.spec.ts`: `POST /api/chat/resume {}` → 400 `ok:false`; bogus sessionId → 4xx/5xx JSON `ok:false`
(never a crash / HTML error page); Playwright `request` only, no UI dependency.
