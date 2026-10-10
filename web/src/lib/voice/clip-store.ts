import "server-only";
/**
 * Short-lived public clip store for the voice path. The OnDemand speech_to_text service only accepts a PUBLIC `audioUrl`, so the recorded
 * clip is parked here (process memory, 10-minute TTL) and served back by `GET /api/voice/clip/[token]` from the deployed origin.
 * Kept on globalThis so Next's per-route module instances share one map in a single process. Not durable across instances — a clip is
 * consumed within seconds by the STT call that created it, so that is acceptable for this relay.
 */
export type StoredClip = { bytes: Uint8Array; type: string; at: number };
const TTL_MS = 10 * 60_000;
const MAX_CLIPS = 64;
const g = globalThis as unknown as { __bcapVoiceClips?: Map<string, StoredClip> };
const clips = (g.__bcapVoiceClips ??= new Map<string, StoredClip>());

const sweep = () => { const now = Date.now(); for (const [k, v] of clips) if (now - v.at > TTL_MS) clips.delete(k); while (clips.size > MAX_CLIPS) { const first = clips.keys().next().value; if (first === undefined) break; clips.delete(first); } };

export const putClip = (bytes: Uint8Array, type: string): string => {
  sweep();
  const token = crypto.randomUUID().replace(/-/g, "") + Date.now().toString(36);
  clips.set(token, { bytes, type, at: Date.now() });
  return token;
};
export const getClip = (token: string): StoredClip | null => { const c = clips.get(token); if (!c) return null; if (Date.now() - c.at > TTL_MS) { clips.delete(token); return null; } return c; };
export const deleteClip = (token: string) => { clips.delete(token); };

/** Public origin the OnDemand service can reach. The clip lives in THIS process, so the request's own (forwarded) host wins — it is the
 *  instance that holds the bytes; NEXT_PUBLIC_SITE_URL is used only when the request host is missing or local (dev), where upstream could
 *  not fetch a localhost URL anyway. */
export const publicOrigin = (req: Request): string => {
  const h = req.headers; const host = h.get("x-forwarded-host")?.split(",")[0].trim() || h.get("host");
  const local = !host || /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|$)/.test(host);
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (local && env) return env;
  if (host) { const proto = h.get("x-forwarded-proto")?.split(",")[0].trim() || (local ? "http" : "https"); return `${proto}://${host}`; }
  return env || new URL(req.url).origin;
};
