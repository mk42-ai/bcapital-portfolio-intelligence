import "server-only";
import { fromWire, kindFromMime, type Artifact, type ArtifactKind, type ArtifactMediaStatus, type ArtifactSource, type ArtifactWire } from "./types";

/** Backend base + secret (server-only; the secret never reaches the browser). */
export const artifactsBackend = (): string => (process.env.PORTFOLIO_API_URL ?? process.env.NEXT_PUBLIC_PORTFOLIO_API_URL ?? "https://sb-4wdkkmzv7w2z.vercel.run").replace(/\/$/, "");
export const ingestSecret = (): string | undefined => process.env.INGEST_SECRET?.trim() || undefined;
/** The ONE snake_case → camelCase mapping (re-exported from ./types so client code can share it). */
export const toArtifact = (w: ArtifactWire): Artifact => fromWire(w);

export type SaveArtifactInput = {
  bytes?: Uint8Array | ArrayBuffer | Buffer; url?: string; name: string; mime?: string; kind?: ArtifactKind; source?: ArtifactSource;
  mediaId?: string | null; mediaStatus?: ArtifactMediaStatus; mediaMessage?: string | null; mediaUrl?: string | null; threadId?: string | null; sessionId?: string | null; originEvent?: string | null;
};

/** Persist an artifact via backend POST /artifacts (adds X-Ingest-Secret). Throws on failure. Used by /api/media and /api/chat in-process. */
export async function saveArtifact(input: SaveArtifactInput): Promise<Artifact> {
  const secret = ingestSecret();
  if (!secret) throw new Error("INGEST_SECRET is not configured on the frontend server");
  if (!input.bytes && !input.url) throw new Error("saveArtifact needs bytes or url");
  const mime = input.mime || "application/octet-stream";
  const body: Record<string, unknown> = {
    name: input.name, mime, kind: input.kind ?? kindFromMime(mime, input.name), source: input.source ?? "generated",
    media_id: input.mediaId ?? null, media_status: input.mediaStatus ?? null, media_message: input.mediaMessage ?? null, media_url: input.mediaUrl ?? null,
    thread_id: input.threadId ?? null, session_id: input.sessionId ?? null, origin_event: input.originEvent ?? null,
  };
  if (input.bytes) {
    const u8 = input.bytes instanceof ArrayBuffer ? new Uint8Array(input.bytes) : new Uint8Array(input.bytes.buffer, input.bytes.byteOffset, input.bytes.byteLength);
    body.content_base64 = Buffer.from(u8).toString("base64");
  } else body.url = input.url;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 60000);
  try {
    const r = await fetch(`${artifactsBackend()}/artifacts`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", "X-Ingest-Secret": secret }, body: JSON.stringify(body), signal: ctl.signal, cache: "no-store" });
    const text = await r.text();
    if (!r.ok) throw new Error(`Backend POST /artifacts ${r.status}: ${text.slice(0, 300)}`);
    const j = JSON.parse(text) as { data: ArtifactWire };
    return toArtifact(j.data);
  } finally { clearTimeout(t); }
}

/** List artifacts from the backend (server-side). Returns [] on failure. */
export async function listArtifacts(q: { threadId?: string; kind?: string; limit?: number } = {}): Promise<{ data: Artifact[]; ok: boolean }> {
  const p = new URLSearchParams();
  if (q.threadId) p.set("thread_id", q.threadId); if (q.kind) p.set("kind", q.kind); p.set("limit", String(q.limit ?? 200));
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(`${artifactsBackend()}/artifacts?${p}`, { headers: { accept: "application/json" }, cache: "no-store", signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return { data: [], ok: false };
    const j = (await r.json()) as { data: ArtifactWire[] };
    return { data: (j.data ?? []).map(toArtifact), ok: true };
  } catch { return { data: [], ok: false }; }
}
