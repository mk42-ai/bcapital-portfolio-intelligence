"use client";
/**
 * Voice capture hook — MediaRecorder + WebAudio AnalyserNode RMS (no npm VAD package).
 *  • container: audio/webm;codecs=opus → audio/mp4 fallback → browser default
 *  • level: RMS 0–1 for the orb, exposed WITHOUT re-rendering (levelRef + subscribeLevel) — the orb reads it on its own animation frame
 *  • VAD endpointing: speech when rms > 0.02 for ≥ 120 ms; end-of-utterance after 900 ms below threshold; hard cap 30 s per utterance
 *  • modes: 'ptt' (hold mic button / Space while focused; release ends the utterance) and 'hands-free' (VAD endpoints; the dock restarts
 *    capture after the assistant finishes speaking); in hands-free a capture with no speech for NO_SPEECH_MS ends silently
 *  • permission: 'prompt' | 'granted' | 'denied' | 'unsupported' (no navigator.mediaDevices / MediaRecorder, or insecure context)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type VoicePermission = "prompt" | "granted" | "denied" | "unsupported";
export type CaptureMode = "ptt" | "hands-free";
export type CaptureStatus = "idle" | "listening";
export type Utterance = { blob: Blob; mimeType: string; durationMs: number; speechMs: number };
export type VoiceCaptureOptions = {
  mode: CaptureMode;
  onUtterance: (u: Utterance) => void;
  /** Fires once per capture the moment speech is confirmed (≥ 120 ms above threshold) — the dock uses it for barge-in. */
  onSpeechStart?: () => void;
  onError?: (code: "denied" | "unsupported" | "device", message: string) => void;
};

export const VAD = { threshold: 0.02, minSpeechMs: 120, endSilenceMs: 900, maxUtteranceMs: 30_000, noSpeechMs: 12_000 } as const;
const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

export const detectSupport = (): VoicePermission => {
  if (typeof window === "undefined") return "unsupported";
  if (!window.isSecureContext) return "unsupported";
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return "unsupported";
  if (typeof (window.AudioContext ?? (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext) === "undefined") return "unsupported";
  return "prompt";
};
export const pickMimeType = (): string => { if (typeof MediaRecorder === "undefined") return ""; for (const m of MIME_CANDIDATES) if (MediaRecorder.isTypeSupported?.(m)) return m; return ""; };
const extFor = (mime: string) => (/mp4|m4a/.test(mime) ? "m4a" : /ogg/.test(mime) ? "ogg" : /wav/.test(mime) ? "wav" : "webm");

type Session = { stream: MediaStream; ctx: AudioContext; analyser: AnalyserNode; rec: MediaRecorder | null; chunks: Blob[]; mime: string; startedAt: number; speechMs: number; raf: number; stopping: boolean };

export function useVoiceCapture(opts: VoiceCaptureOptions) {
  const [permission, setPermission] = useState<VoicePermission>("prompt");
  const [status, setStatus] = useState<CaptureStatus>("idle");
  const [speaking, setSpeaking] = useState(false);
  const levelRef = useRef(0);
  const levelSubs = useRef(new Set<(v: number) => void>());
  const session = useRef<Session | null>(null);
  const optsRef = useRef(opts); optsRef.current = opts;

  // Support + permission discovery (Permissions API is optional; Firefox throws on {name:"microphone"}).
  useEffect(() => {
    const base = detectSupport(); setPermission(base); if (base === "unsupported") return;
    let cancelled = false; let ps: PermissionStatus | null = null;
    const apply = (s: PermissionState) => { if (!cancelled) setPermission(s === "granted" ? "granted" : s === "denied" ? "denied" : "prompt"); };
    navigator.permissions?.query?.({ name: "microphone" as PermissionName }).then((p) => { ps = p; apply(p.state); p.onchange = () => apply(p.state); }).catch(() => {});
    return () => { cancelled = true; if (ps) ps.onchange = null; };
  }, []);

  const subscribeLevel = useCallback((cb: (v: number) => void) => { levelSubs.current.add(cb); return () => { levelSubs.current.delete(cb); }; }, []);
  const publishLevel = (v: number) => { levelRef.current = v; levelSubs.current.forEach((cb) => cb(v)); };

  const teardown = useCallback(() => {
    const s = session.current; session.current = null;
    if (!s) return;
    cancelAnimationFrame(s.raf);
    try { s.stream.getTracks().forEach((t) => t.stop()); } catch {}
    void s.ctx.close().catch(() => {});
    publishLevel(0); setSpeaking(false); setStatus("idle");
  }, []);

  /** Ends the current utterance: hands the recorded blob to onUtterance (unless discard) and releases the mic. */
  const stop = useCallback((discard = false) => {
    const s = session.current; if (!s || s.stopping) return; s.stopping = true;
    const finish = () => {
      const durationMs = Date.now() - s.startedAt; const speechMs = s.speechMs;
      const blob = new Blob(s.chunks, { type: s.mime || s.chunks[0]?.type || "audio/webm" });
      teardown();
      if (!discard && speechMs >= VAD.minSpeechMs && blob.size > 0) optsRef.current.onUtterance({ blob, mimeType: blob.type, durationMs, speechMs });
    };
    const rec = s.rec;
    if (rec && rec.state !== "inactive") { rec.onstop = finish; try { rec.stop(); } catch { finish(); } } else finish();
  }, [teardown]);
  const cancel = useCallback(() => stop(true), [stop]);

  const start = useCallback(async (): Promise<boolean> => {
    if (session.current) return true;
    const support = detectSupport();
    if (support === "unsupported") { setPermission("unsupported"); optsRef.current.onError?.("unsupported", "Voice input is not supported in this browser or context"); return false; }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    } catch (e) {
      const name = (e as DOMException)?.name ?? "";
      if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") { setPermission("denied"); optsRef.current.onError?.("denied", "Microphone access is blocked"); }
      else optsRef.current.onError?.("device", name === "NotFoundError" ? "No microphone was found" : `Microphone error: ${name || String(e)}`);
      return false;
    }
    setPermission("granted");
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx(); const src = ctx.createMediaStreamSource(stream); const analyser = ctx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.3; src.connect(analyser);
    const mime = pickMimeType(); let rec: MediaRecorder | null = null;
    try { rec = mime ? new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 32_000 }) : new MediaRecorder(stream); } catch { try { rec = new MediaRecorder(stream); } catch { rec = null; } }
    if (!rec) { stream.getTracks().forEach((t) => t.stop()); void ctx.close(); optsRef.current.onError?.("unsupported", "MediaRecorder could not be started"); return false; }
    const s: Session = { stream, ctx, analyser, rec, chunks: [], mime: rec.mimeType || mime, startedAt: Date.now(), speechMs: 0, raf: 0, stopping: false };
    rec.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) s.chunks.push(ev.data); };
    rec.start(250);
    session.current = s; setStatus("listening");
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    // VAD loop on the analyser (no AudioWorklet needed for RMS).
    const buf = new Float32Array(analyser.fftSize);
    let aboveSince = 0, belowSince = 0, inSpeech = false, speechStartedAt = 0, lastTick = performance.now();
    const tick = (now: number) => {
      if (session.current !== s || s.stopping) return;
      analyser.getFloatTimeDomainData(buf);
      let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.min(1, Math.sqrt(sum / buf.length) * 3); // ×3: speech at a normal distance sits around 0.05–0.3 raw
      publishLevel(rms);
      const dt = now - lastTick; lastTick = now;
      const loud = rms > VAD.threshold * 3; // threshold is specified on raw RMS; level is the ×3 display value
      if (loud) { belowSince = 0; aboveSince += dt; if (!inSpeech && aboveSince >= VAD.minSpeechMs) { inSpeech = true; speechStartedAt = now; setSpeaking(true); optsRef.current.onSpeechStart?.(); } }
      else { aboveSince = 0; if (inSpeech) { belowSince += dt; if (belowSince >= VAD.endSilenceMs) { inSpeech = false; s.speechMs += now - speechStartedAt - belowSince; setSpeaking(false); if (optsRef.current.mode === "hands-free") { stop(); return; } } } }
      const elapsed = Date.now() - s.startedAt;
      if (inSpeech) s.speechMs = Math.max(s.speechMs, now - speechStartedAt);
      if (elapsed >= VAD.maxUtteranceMs) { stop(); return; }
      if (optsRef.current.mode === "hands-free" && !inSpeech && s.speechMs === 0 && elapsed >= VAD.noSpeechMs) { stop(true); return; }
      s.raf = requestAnimationFrame(tick);
    };
    s.raf = requestAnimationFrame(tick);
    return true;
  }, [stop]);

  useEffect(() => () => { const s = session.current; if (s) { cancelAnimationFrame(s.raf); try { s.rec?.state !== "inactive" && s.rec?.stop(); } catch {} s.stream.getTracks().forEach((t) => t.stop()); void s.ctx.close().catch(() => {}); session.current = null; } }, []);

  const requestPermission = useCallback(async () => { const ok = await start(); if (ok) cancel(); return ok; }, [start, cancel]);
  const fileName = useMemo(() => `utterance.${extFor(session.current?.mime ?? pickMimeType())}`, []);
  return { permission, status, speaking, levelRef, subscribeLevel, start, stop, cancel, requestPermission, fileName, extFor };
}
