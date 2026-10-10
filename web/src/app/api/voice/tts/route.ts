import { NextRequest } from "next/server";
import { textToSpeech, TTS_VOICES, TTS_MAX_CHARS, type TtsVoice } from "@/lib/voice/ondemand-audio";

/**
 * POST /api/voice/tts  { text, voice? }  →  { ok:true, audioUrl, chars, ms, voice }
 *                                         |  { ok:false, code:"not_subscribed"|"upstream"|"no_key"|"bad_request", message }  (400 / 502 / 503)
 * One sentence chunk per call (≤ 600 chars) — the client's tts-queue sentence-splits the streamed answer. Live probe: web/proof/voice/probe.json.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "cache-control": "no-store" };

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { text?: unknown; voice?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.replace(/\s+/g, " ").trim() : "";
  if (!text) return Response.json({ ok: false, code: "bad_request", message: "text is required" }, { status: 400, headers: NO_STORE });
  if (text.length > TTS_MAX_CHARS) return Response.json({ ok: false, code: "bad_request", message: `text must be ≤ ${TTS_MAX_CHARS} characters per call` }, { status: 400, headers: NO_STORE });
  const voice = (TTS_VOICES as readonly string[]).includes(String(body?.voice ?? "")) ? (body!.voice as TtsVoice) : "alloy";
  const t0 = Date.now();
  const r = await textToSpeech(text, voice, req.headers.get("x-ondemand-key"));
  if (!r.ok) return Response.json({ ok: false, code: r.code, message: r.message }, { status: r.status, headers: NO_STORE });
  const audioUrl = r.data.audioUrl;
  if (!audioUrl || !/^https?:\/\//.test(audioUrl)) return Response.json({ ok: false, code: "upstream", message: "text_to_speech returned no audioUrl" }, { status: 502, headers: NO_STORE });
  return Response.json({ ok: true, audioUrl, chars: text.length, voice, ms: Date.now() - t0 }, { headers: NO_STORE });
}
