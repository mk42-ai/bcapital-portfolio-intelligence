import "server-only";
/**
 * OnDemand audio services — LIVE CONTRACT (docs/ONDEMAND_CONTRACTS.md, probed 2026-10-10, web/proof/voice/probe.json):
 *   POST {base}/services/v1/public/service/execute/text_to_speech  { model: "tts-1"|"tts-1-hd", input, voice }  → { message, data: { audioUrl } }
 *   POST {base}/services/v1/public/service/execute/speech_to_text  { audioUrl }                                  → { message, data: { text } }
 * Both can answer HTTP 400 "Please subscribe to the service" on an account without the service → surfaced as code "not_subscribed"
 * (BLOCKED_BY_EXTERNAL_DEPENDENCY) — never faked. The API key lives only here (serverApiKey()).
 */
import { ONDEMAND_BASE_URL, serverApiKey, UPSTREAM_USER_AGENT } from "@/lib/ondemand/config";

export const TTS_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
export type TtsVoice = (typeof TTS_VOICES)[number];
export const TTS_MAX_CHARS = 600;
export type VoiceFailure = { ok: false; code: "not_subscribed" | "upstream" | "no_key" | "bad_request"; message: string; status: number };

const SERVICE_URL = (name: string) => `${ONDEMAND_BASE_URL}/services/v1/public/service/execute/${name}`;
const NOT_SUBSCRIBED_RE = /subscribe/i;

export const isVoiceFailure = (x: unknown): x is VoiceFailure => !!x && typeof x === "object" && (x as { ok?: unknown }).ok === false;

async function execute<T>(name: string, body: Record<string, unknown>, userKey: string | null, timeoutMs: number): Promise<{ ok: true; data: T; ms: number } | VoiceFailure> {
  const key = userKey?.trim() || serverApiKey();
  if (!key) return { ok: false, code: "no_key", message: "ONDEMAND_API_KEY is not configured on the server", status: 503 };
  const t0 = Date.now();
  let r: Response;
  try {
    r = await fetch(SERVICE_URL(name), { method: "POST", headers: { apikey: key, "content-type": "application/json", "user-agent": UPSTREAM_USER_AGENT }, body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    return { ok: false, code: "upstream", message: `OnDemand ${name} unreachable: ${String((e as Error)?.message ?? e)}`, status: 502 };
  }
  const j = (await r.json().catch(() => ({}))) as { message?: string; data?: T; error?: string };
  if (r.status === 400 && NOT_SUBSCRIBED_RE.test(j?.message ?? j?.error ?? "")) return { ok: false, code: "not_subscribed", message: j.message ?? j.error ?? "Please subscribe to the service", status: 400 };
  if (!r.ok || !j?.data) return { ok: false, code: "upstream", message: `OnDemand ${name} answered HTTP ${r.status}${j?.message ? `: ${j.message}` : ""}`, status: 502 };
  return { ok: true, data: j.data, ms: Date.now() - t0 };
}

export const textToSpeech = (input: string, voice: TtsVoice, userKey: string | null = null, model: "tts-1" | "tts-1-hd" = "tts-1") =>
  execute<{ audioUrl?: string }>("text_to_speech", { model, input, voice }, userKey, 20_000);

export const speechToText = (audioUrl: string, userKey: string | null = null) =>
  execute<{ text?: string }>("speech_to_text", { audioUrl }, userKey, 30_000);
