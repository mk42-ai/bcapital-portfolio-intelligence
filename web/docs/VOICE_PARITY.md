# Voice parity — a voice turn is indistinguishable from a typed turn

Owner: voice dock (`web/src/components/chat/voice/*`) + the two relays under `web/src/app/api/voice/*`.
Goal: the run rail, plan and OnDemand session on a voice turn show the **same `pluginIds` and `sessionId`** a typed turn would,
and both relays can log / echo those fields so the parity can be asserted without a microphone.

## Sources of truth (shared with the typed path)

| Field       | Read from                                                                                   | Same call the typed path uses                |
|-------------|---------------------------------------------------------------------------------------------|----------------------------------------------|
| `pluginIds` | `getSelectedPluginIds()` — `@/lib/plugin-selection` (sessionStorage `bcap.chat.plugins.session.v1`, pinned id first) | `chat-shell.tsx` fetch wrapper (`/api/chat`) |
| `sessionId` | `getCurrentSessionId({}, getCurrentThreadId())` — `@/components/chat/open-intelligent-ui/chat-shell` (per-thread map → live stream store) | `chat-shell.tsx` session getter for uploads  |

Both are read **at submit time** (not at mount) so a plugin toggled in the panel right before speaking is honoured.

## End-to-end flow and field names

```
mic (PTT / hands-free)
  └─ use-voice-capture.ts  → onUtterance({ blob, mimeType })                         (no parity fields: audio only)
       └─ voice-dock.tsx  submitTranscript(blob, mimeType)
            ├─ { pluginIds, sessionId } = parity()                                   (getSelectedPluginIds + getCurrentSessionId)
            ├─ POST /api/voice/stt  multipart:
            │     audio      = utterance.<webm|ogg|wav|m4a|mp3>
            │     pluginIds  = "plugin-a,plugin-b"        (comma list)
            │     sessionId  = "<session id>" | ""
            │   ← { ok:true, text, ms, bytes, type, pluginIds:string[], sessionId:string|null }   (echo; audio bytes never logged)
            │   ← { ok:false, code, message, clipUrl, pluginIds, sessionId }                     (same echo on failure)
            └─ submitTranscriptText(text)                                            (text-only tail, also the e2e hook)
                 ├─ setStream({ voice:{ phase:"transcript", text }, pluginIds, sessionId }, true)
                 │     → run rail / plan / inspector read stream.pluginIds + stream.sessionId exactly as on a typed turn
                 ├─ markVoiceOrigin(text)                                            ('via voice' chip only — nothing else differs)
                 ├─ tts.follow()                                                     (unless BLOCKED_BY_EXTERNAL_DEPENDENCY)
                 └─ processMessage({ role:"user", content:text })                    (ordinary OpenUI turn → /api/chat with the SAME ids)
                      └─ answer streams into the store → tts-queue.ts splits sentences
                           └─ POST /api/voice/tts  JSON:
                                 { text, voice, pluginIds:string[], sessionId:string|null }     (context() = dock parity())
                              ← { ok:true, audioUrl, chars, voice, ms, pluginIds, sessionId }   (echo; audio behaviour unchanged)
```

### Relay validation (both routes)
* `pluginIds`: array **or** comma list → trimmed, `^[A-Za-z0-9._:-]{1,64}$` only, de-duplicated, max 16. Unknown/invalid entries are dropped, never rejected.
* `sessionId`: string matching `^[A-Za-z0-9._:-]{1,128}$` → echoed; anything else → `null`.
* Neither field is forwarded to the OnDemand audio services (`speech_to_text` / `text_to_speech` take only audio/text + voice).
  They exist for logging and for the client-side parity assertion.

## DOM contract (for tests, no network needed)

The mic button `[data-testid="voice-mic"]` carries, updated every render and **mount-gated** (empty string during SSR / first paint):

* `data-plugin-ids` — comma list from `usePluginSelection()` (identical to `getSelectedPluginIds().join(",")`)
* `data-session-id` — live `stream.sessionId`, falling back to the per-thread session map; `""` before the first turn of a thread

## E2E hook

When `localStorage["bcap.e2e"] === "1"` the dock exposes `window.__bcapVoiceSubmit(text: string): Promise<void>`, which runs the
**text-only** tail (`submitTranscriptText`: parity `setStream` → `markVoiceOrigin` → `tts.follow` → `processMessage`) and skips mic + STT.
Not defined otherwise; removed on unmount.

## Invariants
* No parity write happens for an empty transcript ("Didn't catch that") or on an STT failure — nothing reaches the thread.
* The only user-visible difference between a voice and a typed turn is the `via voice` chip (`voice-origin.ts`).
* Orb visuals come from `./voice-orb` (`ASSET.voiceIdle|voiceListening|voiceThinking`) — no `/fallbacks/*` URLs remain in the voice dock.
