import "server-only";
import { ONDEMAND_BASE_URL, serverApiKey, UPSTREAM_USER_AGENT, DEFAULT_EXTERNAL_USER_ID } from "@/lib/ondemand/config";
import { putBlob, deleteBlob, MEDIA_PLUGIN_BY_KIND, type MediaKind } from "@/lib/media/store";
import { unsignedUrl, expiryFromSignedUrl } from "./types";

/**
 * Register a generated file with the OnDemand Media API (documented `POST /media/v1/public/file`, live docs 2026-10-11:
 * body { url*, plugins*, responseMode* "sync"|"webhook", name, sizeBytes, sessionId, externalUserId }). The Media API FETCHES the file
 * by URL, so the bytes are published for 2 h at `/api/media/blob/<token>/<name>` (same relay /api/media uses) and that URL is handed over.
 * Returns the OnDemand media id, or an honest failure status (`failed` + upstream message) — the artifact is still stored in the backend.
 */
export type MediaRegistration = {
  mediaId: string | null; mediaStatus: "stored" | "failed"; mediaMessage: string | null; upstreamStatus: number | null; ms: number;
  /** UNSIGNED sourceUrl (query string stripped) — the only URL form that is persisted. */
  sourceUrl: string | null;
  /** The signed SAS url returned at creation — for immediate use only, NEVER persisted (re-sign via /artifacts/:id/signed-url). */
  signedUrl: string | null;
  /** `se=` of the signed url, ISO. */
  expiresAt: string | null;
  externalUserId: string | null;
  plugins: string[];
};
const NO_MEDIA = { sourceUrl: null, signedUrl: null, expiresAt: null, externalUserId: null, plugins: [] as string[] };

export function originFrom(req: Request): string {
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const local = !host || /^(localhost|127\.|0\.0\.0\.0)/.test(host);
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (local && env && /^https?:\/\//.test(env)) return env;
  return `${proto}://${host}`;
}

const kindForMedia = (mime: string): MediaKind => (mime.startsWith("image/") ? "image" : mime.startsWith("audio/") ? "audio" : "document");

export async function registerWithOnDemand(opts: { bytes: Uint8Array; name: string; mime: string; origin: string; sessionId?: string | null; externalUserId?: string | null; key?: string }): Promise<MediaRegistration> {
  const t0 = Date.now();
  const key = opts.key || serverApiKey();
  const externalUserId = (opts.externalUserId || DEFAULT_EXTERNAL_USER_ID).slice(0, 64);
  if (!key) return { ...NO_MEDIA, mediaId: null, mediaStatus: "failed", mediaMessage: "OnDemand API key not configured on the server", upstreamStatus: null, ms: 0, externalUserId };
  if (opts.mime.startsWith("video/")) return { ...NO_MEDIA, mediaId: null, mediaStatus: "failed", mediaMessage: "OnDemand Media API has no video file plugin on this account — stored in the backend only", upstreamStatus: null, ms: 0, externalUserId };
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex");
  putBlob(token, { bytes: opts.bytes, mime: opts.mime, name: opts.name });
  const url = `${opts.origin}/api/media/blob/${token}/${encodeURIComponent(opts.name.replace(/[^A-Za-z0-9._-]+/g, "_"))}`;
  const kind = kindForMedia(opts.mime);
  const plugins = [MEDIA_PLUGIN_BY_KIND[kind]];
  const body = { url, name: opts.name, sizeBytes: opts.bytes.byteLength, ...(opts.sessionId ? { sessionId: opts.sessionId } : {}), externalUserId, plugins, responseMode: "sync" as const };
  const base = { ...NO_MEDIA, externalUserId, plugins };
  try {
    const r = await fetch(`${ONDEMAND_BASE_URL}/media/v1/public/file`, { method: "POST", headers: { apikey: key, "content-type": "application/json", "user-agent": UPSTREAM_USER_AGENT }, body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(60_000) });
    const raw = await r.text();
    let j: { message?: string; data?: { id?: string; url?: string; sourceUrl?: string } } = {};
    try { j = JSON.parse(raw); } catch { /* non-JSON */ }
    if (r.ok && typeof j.data?.id === "string") {
      // data: { id, url (signed SAS), sourceUrl, extractedTextUrl, … } — keep the id + UNSIGNED sourceUrl; the signed url is returned but never stored.
      const signed = typeof j.data.url === "string" ? j.data.url : null;
      const sourceUrl = unsignedUrl(typeof j.data.sourceUrl === "string" ? j.data.sourceUrl : signed);
      return { ...base, mediaId: j.data.id, mediaStatus: "stored", mediaMessage: null, upstreamStatus: r.status, ms: Date.now() - t0, sourceUrl, signedUrl: signed, expiresAt: expiryFromSignedUrl(signed) };
    }
    deleteBlob(token);
    return { ...base, mediaId: null, mediaStatus: "failed", mediaMessage: `OnDemand Media API HTTP ${r.status}: ${(j.message ?? raw).slice(0, 200)}`, upstreamStatus: r.status, ms: Date.now() - t0 };
  } catch (e) {
    deleteBlob(token);
    return { ...base, mediaId: null, mediaStatus: "failed", mediaMessage: `OnDemand Media API unreachable: ${String((e as Error)?.message ?? e).slice(0, 160)}`, upstreamStatus: null, ms: Date.now() - t0 };
  }
}
