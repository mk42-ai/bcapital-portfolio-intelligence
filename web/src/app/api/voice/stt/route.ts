import { NextRequest } from "next/server";
import { speechToText } from "@/lib/voice/ondemand-audio";
import { putClip, deleteClip, publicOrigin } from "@/lib/voice/clip-store";

/**
 * POST /api/voice/stt  multipart { audio: Blob (webm/ogg/wav/m4a/mp3, ≤ 8 MB), pluginIds?: "id,id", sessionId?: string }  →  { ok:true, text, ms, bytes, type, pluginIds, sessionId }
 * pluginIds / sessionId are parity context from the voice turn (docs/VOICE_PARITY.md): validated + echoed back so the client can assert the relay saw
 * the same ids the typed path uses. Audio bytes are never logged.
 * The OnDemand speech_to_text service needs a PUBLIC audioUrl, so the clip is parked in the in-process clip store and exposed as
 * `${origin}/api/voice/clip/<token>` (TTL 10 min, deleted right after the STT call). Live round-trip proof: web/proof/voice/probe.json.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "cache-control": "no-store" };
const MAX_BYTES = 8 * 1024 * 1024;
const TYPE_OK = /^audio\/(webm|ogg|wav|x-wav|wave|mp4|m4a|x-m4a|mpeg|mp3|aac)(;.*)?$/i;
const EXT_OK = /\.(webm|ogg|wav|m4a|mp3|mp4|aac)$/i;

export async function POST(req: NextRequest) {
  let form: FormData;
  try { form = await req.formData(); } catch { return Response.json({ ok: false, code: "bad_request", message: "multipart form with an `audio` file is required" }, { status: 400, headers: NO_STORE }); }
  const audio = form.get("audio");
  const pluginIds = parsePluginIds(form.get("pluginIds")); const sessionId = parseSessionId(form.get("sessionId"));
  if (!(audio instanceof Blob) || audio.size === 0) return Response.json({ ok: false, code: "bad_request", message: "audio file is required" }, { status: 400, headers: NO_STORE });
  if (audio.size > MAX_BYTES) return Response.json({ ok: false, code: "bad_request", message: "audio clip must be ≤ 8 MB" }, { status: 413, headers: NO_STORE });
  const name = (audio as File).name ?? "";
  const type = (audio.type || "").split(";")[0].trim() || (EXT_OK.test(name) ? `audio/${name.split(".").pop()!.toLowerCase()}` : "");
  if (!TYPE_OK.test(type) && !EXT_OK.test(name)) return Response.json({ ok: false, code: "bad_request", message: `unsupported audio type ${type || "(unknown)"}` }, { status: 415, headers: NO_STORE });
  const bytes = new Uint8Array(await audio.arrayBuffer());
  const token = putClip(bytes, type || "application/octet-stream");
  const audioUrl = `${publicOrigin(req)}/api/voice/clip/${token}`;
  const t0 = Date.now();
  try {
    const r = await speechToText(audioUrl, req.headers.get("x-ondemand-key"));
    if (!r.ok) return Response.json({ ok: false, code: r.code, message: r.message, clipUrl: audioUrl, pluginIds, sessionId }, { status: r.status, headers: NO_STORE });
    const text = (r.data.text ?? "").trim();
    return Response.json({ ok: true, text, ms: Date.now() - t0, bytes: bytes.byteLength, type, pluginIds, sessionId }, { headers: NO_STORE });
  } finally {
    // The service has fetched the clip by the time it answers; free it (TTL sweep covers crashes).
    setTimeout(() => deleteClip(token), 5_000);
  }
}

const ID_OK = /^[A-Za-z0-9._:-]{1,64}$/;
/** Accepts a string[] or a comma list; keeps well-formed ids only (≤ 16), de-duplicated. (Duplicated in stt/route.ts — route files may only export handlers.) */
function parsePluginIds(v: unknown): string[] {
  const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
  return [...new Set(list.map((x) => String(x ?? "").trim()).filter((x) => ID_OK.test(x)))].slice(0, 16);
}
function parseSessionId(v: unknown): string | null { const s = typeof v === "string" ? v.trim() : ""; return s && /^[A-Za-z0-9._:-]{1,128}$/.test(s) ? s : null; }
