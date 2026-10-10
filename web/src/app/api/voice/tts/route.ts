import { NextRequest } from "next/server";
import { textToSpeech, TTS_VOICES, TTS_MAX_CHARS, type TtsVoice } from "@/lib/voice/ondemand-audio";

/**
 * POST /api/voice/tts  { text, voice?, pluginIds?: string[], sessionId?: string|null }  →  { ok:true, audioUrl, chars, ms, voice, pluginIds, sessionId }
 * pluginIds / sessionId are parity context from the voice turn (docs/VOICE_PARITY.md): validated, echoed back, never forwarded to the audio service.
 *                                         |  { ok:false, code:"not_subscribed"|"upstream"|"no_key"|"bad_request", message }  (400 / 502 / 503)
 * One sentence chunk per call (≤ 600 chars) — the client's tts-queue sentence-splits the streamed answer. Live probe: web/proof/voice/probe.json.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "cache-control": "no-store" };

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { text?: unknown; voice?: unknown; pluginIds?: unknown; sessionId?: unknown } | null;
  const pluginIds = parsePluginIds(body?.pluginIds); const sessionId = parseSessionId(body?.sessionId);
  const text = typeof body?.text === "string" ? body.text.replace(/\s+/g, " ").trim() : "";
  if (!text) return Response.json({ ok: false, code: "bad_request", message: "text is required" }, { status: 400, headers: NO_STORE });
  if (text.length > TTS_MAX_CHARS) return Response.json({ ok: false, code: "bad_request", message: `text must be ≤ ${TTS_MAX_CHARS} characters per call` }, { status: 400, headers: NO_STORE });
  const voice = (TTS_VOICES as readonly string[]).includes(String(body?.voice ?? "")) ? (body!.voice as TtsVoice) : "alloy";
  const t0 = Date.now();
  const r = await textToSpeech(text, voice, req.headers.get("x-ondemand-key"));
  if (!r.ok) return Response.json({ ok: false, code: r.code, message: r.message }, { status: r.status, headers: NO_STORE });
  const audioUrl = r.data.audioUrl;
  if (!audioUrl || !/^https?:\/\//.test(audioUrl)) return Response.json({ ok: false, code: "upstream", message: "text_to_speech returned no audioUrl" }, { status: 502, headers: NO_STORE });
  return Response.json({ ok: true, audioUrl, chars: text.length, voice, ms: Date.now() - t0, pluginIds, sessionId }, { headers: NO_STORE });
}

const ID_OK = /^[A-Za-z0-9._:-]{1,64}$/;
/** Accepts a string[] or a comma list; keeps well-formed ids only (≤ 16), de-duplicated. (Duplicated in stt/route.ts — route files may only export handlers.) */
function parsePluginIds(v: unknown): string[] {
  const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
  return [...new Set(list.map((x) => String(x ?? "").trim()).filter((x) => ID_OK.test(x)))].slice(0, 16);
}
function parseSessionId(v: unknown): string | null { const s = typeof v === "string" ? v.trim() : ""; return s && /^[A-Za-z0-9._:-]{1,128}$/.test(s) ? s : null; }
