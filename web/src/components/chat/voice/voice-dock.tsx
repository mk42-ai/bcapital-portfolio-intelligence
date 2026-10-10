"use client";
/**
 * Voice dock (Agents 23–27). Mic IconButton portaled into OpenUI's composer action bar BEFORE the send button (MutationObserver finds the
 * bar, like PendingRow finds the loader host), plus a panel above the composer: brand-green SVG orb, live caption strip (aria-live), mode
 * toggle (Push-to-talk / Hands-free) and the voice <select>. A voice turn is an ordinary `processMessage({role:'user', content})` in the
 * SAME thread — same OnDemand session, same plugin selection, same Plan rail — marked only by the 'via voice' chip (voice-origin.ts).
 * Failure modes are honest: denied → retry; unsupported → disabled mic with tooltip; 400 not_subscribed → BLOCKED_BY_EXTERNAL_DEPENDENCY.
 * Plugin parity (Agent 15, docs/VOICE_PARITY.md): before processMessage the dock reads getSelectedPluginIds() + the current session id and writes
 * them into the stream store (setStream({voice, pluginIds, sessionId}, true)) so the run rail / plan show the SAME ids a typed turn would; the same
 * two fields ride along on the STT form (pluginIds, sessionId) and the TTS JSON body, and are mirrored on the mic as data-plugin-ids / data-session-id.
 */
import "./voice.css";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useThread } from "@openuidev/react-ui";
import type { UserMessage } from "@openuidev/react-headless";
import { AudioLines, Loader2, Mic, MicOff, X } from "lucide-react";
import { useSettings } from "@/lib/settings";
import { getSelectedPluginIds, usePluginSelection } from "@/lib/plugin-selection";
import { getCurrentSessionId } from "@/components/chat/open-intelligent-ui/chat-shell";
import { getCurrentThreadId, setStream, useStreamSelector } from "@/components/chat/open-intelligent-ui/stream-store";
import { VoiceOrb } from "./voice-orb";
import { useVoiceCapture, type CaptureMode } from "./use-voice-capture";
import { TtsQueue, type TtsState } from "./tts-queue";
import { markVoiceOrigin, useVoiceOrigin } from "./voice-origin";

export type VoiceState = "idle" | "listening" | "thinking" | "speaking" | "error";
const VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
const PREF_KEY = "bcap.chat.voice.prefs.v1";
const NOT_ENABLED = "Voice service is not enabled on this OnDemand account";
const DENIED = "Microphone access is blocked — allow it in the browser's site settings";
const UNSUPPORTED = "Voice input needs a secure (https) context and microphone support in this browser";
type VoiceError = { code: "denied" | "unsupported" | "not_subscribed" | "upstream" | "device" | "playback"; message: string } | null;

const readPrefs = (): { mode: CaptureMode; voice: string } => { try { const j = JSON.parse(localStorage.getItem(PREF_KEY) ?? "{}"); return { mode: j.mode === "hands-free" ? "hands-free" : "ptt", voice: VOICES.includes(j.voice) ? j.voice : "alloy" }; } catch { return { mode: "ptt", voice: "alloy" }; } };
const ACTION_BAR = ".chat-shell .openui-agent-thread-composer__action-bar, .chat-shell .openui-agent-desktop-welcome-composer__action-bar";
const SUBMIT = ".openui-agent-thread-composer__submit-button, .openui-agent-desktop-welcome-composer__submit-button";

/** Finds the live composer action bar and keeps a host <span> inserted BEFORE the send button (re-inserted when OpenUI re-renders). */
function useActionBarHost() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    let current: HTMLElement | null = null;
    const ensure = () => {
      const bar = document.querySelector<HTMLElement>(ACTION_BAR);
      if (!bar) { if (current) { current.remove(); current = null; setHost(null); } return; }
      if (current && current.parentElement === bar) return;
      current?.remove();
      const span = document.createElement("span"); span.className = "voice-dock-host"; span.setAttribute("data-testid", "voice-dock-host");
      const submit = bar.querySelector(SUBMIT); bar.insertBefore(span, submit ?? bar.firstChild);
      current = span; setHost(span);
    };
    ensure();
    const mo = new MutationObserver(() => ensure()); mo.observe(document.body, { childList: true, subtree: true });
    return () => { mo.disconnect(); current?.remove(); };
  }, []);
  return host;
}
/** Host for the panel: a <div> inserted right before the composer. */
function usePanelHost() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    let current: HTMLElement | null = null;
    const ensure = () => {
      const composer = document.querySelector<HTMLElement>(".chat-shell .openui-agent-thread-composer, .chat-shell .openui-agent-desktop-welcome-composer");
      const parent = composer?.parentElement ?? null;
      if (!parent || !composer) { if (current) { current.remove(); current = null; setHost(null); } return; }
      // Other hosts (attachments / context-chips) may sit between this host and the composer: only re-insert when detached (a stricter check ping-ponged with them in a MutationObserver loop and froze the page).
      if (current && current.parentElement === parent) return;
      current?.remove(); const div = document.createElement("div"); div.className = "voice-panel-host"; parent.insertBefore(div, composer); current = div; setHost(div);
    };
    ensure(); const mo = new MutationObserver(() => ensure()); mo.observe(document.body, { childList: true, subtree: true });
    return () => { mo.disconnect(); current?.remove(); };
  }, []);
  return host;
}

export function VoiceDock() {
  const [settings] = useSettings();
  const processMessage = useThread((s) => s.processMessage); const cancelMessage = useThread((s) => s.cancelMessage); const isRunning = useThread((s) => s.isRunning);
  const [prefs, setPrefs] = useState(readPrefs); const prefsRef = useRef(prefs); prefsRef.current = prefs;
  useEffect(() => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch {} }, [prefs]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<VoiceError>(null);
  const [blocked, setBlocked] = useState(false); // BLOCKED_BY_EXTERNAL_DEPENDENCY (service subscription)
  const [caption, setCaption] = useState<{ kind: "interim" | "final" | "speaking" | "hint"; text: string }>({ kind: "hint", text: "" });
  const [sttBusy, setSttBusy] = useState(false);
  const [ttsState, setTtsState] = useState<TtsState>("idle");
  const micRef = useRef<HTMLButtonElement>(null); const orbRef = useRef<HTMLDivElement>(null);
  const headers = useCallback((): Record<string, string> => (settings.apikey ? { "x-ondemand-key": settings.apikey } : {}), [settings.apikey]);
  const headersRef = useRef(headers); headersRef.current = headers;
  const captureRef = useRef<ReturnType<typeof useVoiceCapture> | null>(null);
  const bargeIn = useRef(false);
  // Parity snapshot (same sources chat-shell's fetch wrapper uses): explicit plugin selection + current OnDemand session for THIS thread.
  const parity = useCallback((): { pluginIds: string[]; sessionId: string | null } => ({ pluginIds: getSelectedPluginIds(), sessionId: getCurrentSessionId({}, getCurrentThreadId()) }), []);
  const parityRef = useRef(parity); parityRef.current = parity;
  // Mirrored on the mic button for tests (mount-gated: sessionStorage / localStorage are not available on the server → React #418 otherwise).
  const [mounted, setMounted] = useState(false); useEffect(() => setMounted(true), []);
  const [selectedPlugins] = usePluginSelection(); const liveSessionId = useStreamSelector((s) => s.sessionId);
  const dataPluginIds = mounted ? selectedPlugins.join(",") : ""; const dataSessionId = mounted ? (liveSessionId ?? getCurrentSessionId({}, getCurrentThreadId()) ?? "") : "";

  const tts = useMemo(() => new TtsQueue({
    voice: () => prefsRef.current.voice, headers: () => headersRef.current(),
    context: () => parityRef.current(),
    onState: setTtsState,
    onSentence: (t) => { if (t) setCaption({ kind: "speaking", text: t }); },
    onError: (code, message) => { if (code === "not_subscribed") { setBlocked(true); setError({ code, message: NOT_ENABLED }); } else if (code === "upstream") setError({ code, message: `Speech playback unavailable: ${message}` }); },
    onFinished: () => { if (prefsRef.current.mode === "hands-free" && !bargeIn.current) void captureRef.current?.start(); bargeIn.current = false; },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => tts.destroy(), [tts]);

  /** Text-only tail of a voice turn (STT already done): parity write → origin chip → TTS follow → ordinary processMessage in the SAME thread. */
  const submitTranscriptText = useCallback(async (raw: string) => {
    const text = raw.trim(); if (!text) return;
    setCaption({ kind: "final", text }); setError(null);
    // Parity: the transcript is an ordinary user turn in the SAME thread (same session, plugins, plan rail) — only the chip differs.
    const { pluginIds, sessionId } = parityRef.current();
    setStream({ voice: { phase: "transcript", text }, pluginIds, ...(sessionId ? { sessionId } : {}) }, true);
    markVoiceOrigin(text);
    if (!blocked) tts.follow();
    await processMessage({ role: "user", content: text });
  }, [processMessage, tts, blocked]);
  const submitTextRef = useRef(submitTranscriptText); submitTextRef.current = submitTranscriptText;
  // E2E hook (Agent 16): text-only voice path without a microphone/STT, ONLY when localStorage "bcap.e2e" === "1".
  useEffect(() => {
    let on = false; try { on = localStorage.getItem("bcap.e2e") === "1"; } catch {}
    if (!on) return;
    const w = window as unknown as { __bcapVoiceSubmit?: (text: string) => Promise<void> };
    w.__bcapVoiceSubmit = (text: string) => submitTextRef.current(text);
    return () => { if (w.__bcapVoiceSubmit) delete w.__bcapVoiceSubmit; };
  }, []);

  const submitTranscript = useCallback(async (blob: Blob, mimeType: string) => {
    setSttBusy(true); setCaption({ kind: "interim", text: "Transcribing…" });
    try {
      const ext = /mp4|m4a/.test(mimeType) ? "m4a" : /ogg/.test(mimeType) ? "ogg" : /wav/.test(mimeType) ? "wav" : /mpeg|mp3/.test(mimeType) ? "mp3" : "webm";
      const { pluginIds, sessionId } = parityRef.current();
      const fd = new FormData(); fd.append("audio", blob, `utterance.${ext}`); fd.append("pluginIds", pluginIds.join(",")); fd.append("sessionId", sessionId ?? "");
      const r = await fetch("/api/voice/stt", { method: "POST", body: fd, headers: headersRef.current() });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; text?: string; code?: string; message?: string; pluginIds?: string[]; sessionId?: string | null };
      if (!j?.ok) { if (j?.code === "not_subscribed") { setBlocked(true); setError({ code: "not_subscribed", message: NOT_ENABLED }); } else setError({ code: "upstream", message: j?.message ?? `Transcription failed (HTTP ${r.status})` }); setCaption({ kind: "hint", text: "" }); return; }
      const text = (j.text ?? "").trim();
      if (!text) { setCaption({ kind: "hint", text: "Didn't catch that — try again." }); if (prefsRef.current.mode === "hands-free") void captureRef.current?.start(); return; }
      await submitTranscriptText(text);
    } catch (e) { setError({ code: "upstream", message: (e as Error).message }); }
    finally { setSttBusy(false); }
  }, [submitTranscriptText]);

  const capture = useVoiceCapture({
    mode: prefs.mode,
    onUtterance: (u) => { void submitTranscript(u.blob, u.mimeType); },
    onSpeechStart: () => {
      setCaption({ kind: "interim", text: "Listening…" });
      // Barge-in: the user started talking while the assistant speaks → stop playback and abort the stream.
      if (tts.active) { bargeIn.current = true; tts.stop(); if (isRunning) cancelMessage(); }
    },
    onError: (code, message) => { setError({ code, message: code === "denied" ? DENIED : code === "unsupported" ? UNSUPPORTED : message }); },
  });
  captureRef.current = capture;
  const isRunningRef = useRef(isRunning); isRunningRef.current = isRunning;

  // Hands-free: listen for barge-in while the assistant is speaking.
  useEffect(() => { if (prefs.mode === "hands-free" && ttsState === "speaking" && capture.status === "idle" && !blocked) void capture.start(); }, [prefs.mode, ttsState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live mic level → CSS var on the mic + orb (no React re-render per frame).
  useEffect(() => capture.subscribeLevel((v) => { const s = v.toFixed(3); micRef.current?.style.setProperty("--voice-level", s); orbRef.current?.style.setProperty("--voice-level", s); }), [capture.subscribeLevel]); // eslint-disable-line react-hooks/exhaustive-deps

  const state: VoiceState = error && (error.code === "denied" || error.code === "unsupported" || error.code === "not_subscribed") ? "error"
    : capture.status === "listening" && (capture.speaking || ttsState !== "speaking") ? "listening"
    : ttsState === "speaking" ? "speaking"
    : sttBusy || (isRunning && (ttsState === "buffering" || tts.active)) || (isRunning && caption.kind === "final") ? "thinking"
    : capture.status === "listening" ? "listening" : "idle";
  const unsupported = capture.permission === "unsupported";
  const inert = unsupported || blocked;

  const startListening = useCallback(async () => {
    if (inert) return; setOpen(true); tts.prime();
    if (tts.active) { bargeIn.current = true; tts.stop(); if (isRunningRef.current) cancelMessage(); }
    setError((e) => (e?.code === "denied" ? e : null)); setCaption({ kind: "hint", text: prefsRef.current.mode === "ptt" ? "Listening — release to send" : "Listening…" });
    const ok = await capture.start(); if (!ok) setCaption({ kind: "hint", text: "" });
  }, [capture, inert, tts, cancelMessage]);
  const stopAll = useCallback(() => { if (capture.status === "listening") capture.cancel(); if (tts.active || ttsState !== "idle") tts.stop(); if (isRunningRef.current && tts.active) cancelMessage(); setCaption({ kind: "hint", text: "" }); micRef.current?.focus(); }, [capture, tts, ttsState, cancelMessage]);

  // Push-to-talk: hold the mic (pointer) or Space while focused; a short tap toggles instead so a click works too.
  const downAt = useRef(0); const spaceHeld = useRef(false);
  const onPointerDown = (e: React.PointerEvent) => { if (e.button !== 0 || inert) return; downAt.current = Date.now(); if (capture.status === "listening") { capture.stop(); downAt.current = 0; return; } void startListening(); };
  const onPointerUp = () => { if (!downAt.current) return; const held = Date.now() - downAt.current; downAt.current = 0; if (prefs.mode === "ptt" && held >= 300 && capture.status === "listening") capture.stop(); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); stopAll(); return; }
    if ((e.key === " " || e.key === "Spacebar") && prefs.mode === "ptt") { e.preventDefault(); if (!spaceHeld.current) { spaceHeld.current = true; if (capture.status !== "listening") void startListening(); } return; }
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (capture.status === "listening") capture.stop(); else void startListening(); }
  };
  const onKeyUp = (e: React.KeyboardEvent) => { if ((e.key === " " || e.key === "Spacebar") && prefs.mode === "ptt" && spaceHeld.current) { spaceHeld.current = false; if (capture.status === "listening") capture.stop(); } };
  // Global Escape stops listening/speaking from anywhere in the shell.
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === "Escape" && (capture.status === "listening" || ttsState !== "idle")) stopAll(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [capture.status, ttsState, stopAll]);
  const retry = async () => { setError(null); const ok = await capture.requestPermission(); if (ok) setCaption({ kind: "hint", text: "Microphone ready." }); };

  const barHost = useActionBarHost(); const panelHost = usePanelHost();
  const reduced = usePrefersReducedMotion();
  const label = unsupported ? "Voice input is not supported here" : blocked ? NOT_ENABLED : state === "listening" ? (prefs.mode === "ptt" ? "Listening — release to send" : "Listening — click to stop") : state === "speaking" ? "Assistant is speaking — click to interrupt" : "Ask by voice";
  const panelVisible = open || !!error;
  return (
    <>
      {barHost && createPortal(
        <button ref={micRef} type="button" className="voice-mic" data-testid="voice-mic" data-state={state} data-mode={prefs.mode} data-plugin-ids={dataPluginIds} data-session-id={dataSessionId} aria-label={label} title={label} aria-pressed={capture.status === "listening"}
          disabled={unsupported} aria-disabled={inert || undefined}
          onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onPointerLeave={onPointerUp} onKeyDown={onKeyDown} onKeyUp={onKeyUp} onClick={(e) => e.preventDefault()}>
          {state === "thinking" ? <Loader2 className="size-4 oiu-spin" aria-hidden /> : state === "speaking" ? <AudioLines className="size-4" aria-hidden /> : unsupported || capture.permission === "denied" ? <MicOff className="size-4" aria-hidden /> : <Mic className="size-4" aria-hidden />}
        </button>, barHost)}
      {panelHost && panelVisible && createPortal(
        <section className="voice-panel" data-testid="voice-panel" data-state={state} aria-label="Voice mode">
          <VoiceOrb ref={orbRef} state={state} reduced={reduced} />
          <div className="voice-panel__body">
            <p className="voice-caption" data-testid="voice-caption" data-kind={caption.kind} aria-live="polite" aria-atomic="true">{caption.text || (state === "idle" ? (prefs.mode === "ptt" ? "Hold the mic (or Space) and speak." : "Hands-free: speak after the tone, interrupt any time.") : state === "thinking" ? "Thinking…" : "")}</p>
            {error && <p className="voice-error" data-testid="voice-error" data-code={error.code} role="alert">
              <span>{error.message}{error.code === "not_subscribed" ? " (BLOCKED_BY_EXTERNAL_DEPENDENCY)" : ""}</span>
              {error.code === "denied" && <button type="button" onClick={() => void retry()}>Retry</button>}
              {(error.code === "upstream" || error.code === "device" || error.code === "playback") && <button type="button" onClick={() => setError(null)}>Dismiss</button>}
            </p>}
          </div>
          <div className="voice-panel__controls">
            <div className="voice-mode" role="group" aria-label="Voice mode" data-testid="voice-mode" data-mode={prefs.mode}>
              <button type="button" aria-pressed={prefs.mode === "ptt"} onClick={() => setPrefs((p) => ({ ...p, mode: "ptt" }))}>Push-to-talk</button>
              <button type="button" aria-pressed={prefs.mode === "hands-free"} onClick={() => setPrefs((p) => ({ ...p, mode: "hands-free" }))}>Hands-free</button>
            </div>
            <select id="voice-select" className="voice-select" data-testid="voice-select" value={prefs.voice} onChange={(e) => setPrefs((p) => ({ ...p, voice: e.target.value }))} aria-label="Assistant voice">
              {VOICES.map((v) => <option key={v} value={v}>{v[0].toUpperCase() + v.slice(1)}</option>)}
            </select>
            <button type="button" className="voice-panel__close" aria-label="Close voice panel" onClick={() => { stopAll(); setOpen(false); if (error?.code !== "denied" && error?.code !== "not_subscribed") setError(null); }}><X className="size-4" aria-hidden /></button>
          </div>
        </section>, panelHost)}
    </>
  );
}

function usePrefersReducedMotion() {
  const [r, setR] = useState<boolean | null>(null);
  useLayoutEffect(() => { const mq = matchMedia("(prefers-reduced-motion: reduce)"); setR(mq.matches); const h = () => setR(mq.matches); mq.addEventListener("change", h); return () => mq.removeEventListener("change", h); }, []);
  return r;
}

const textOf = (m: UserMessage): string => (typeof m.content === "string" ? m.content : Array.isArray(m.content) ? (m.content as { type?: string; text?: string }[]).map((p) => (p?.type === "text" ? p.text ?? "" : "")).join("") : "");
/** Default-looking user bubble + the 'via voice' chip when the message originated from the voice dock. */
export function VoiceUserMessage({ message }: { message: UserMessage }) {
  const text = textOf(message); const viaVoice = useVoiceOrigin(message.id, text);
  return (
    <div className="openui-agent-thread-message-user">
      <div className="voice-user-message">
        <div className="openui-agent-thread-message-user__content">{text}</div>
        {viaVoice && <span className="voice-origin" data-testid="voice-origin"><Mic className="size-3" aria-hidden /> via voice</span>}
      </div>
    </div>
  );
}
