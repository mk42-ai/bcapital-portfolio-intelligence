import "server-only";
import {
  fromWire,
  kindFromMime,
  unsignedUrl,
  versionsFromWire,
  type Artifact,
  type ArtifactKind,
  type ArtifactMediaStatus,
  type ArtifactSource,
  type ArtifactVersions,
  type ArtifactVersionsWire,
  type ArtifactWire,
  type SignedUrlResult,
  type SignedUrlWire,
  signedFromWire,
} from "./types";

/** Backend base + secret (server-only; the secret never reaches the browser). */
export const artifactsBackend = (): string =>
  (
    process.env.PORTFOLIO_API_URL ??
    process.env.NEXT_PUBLIC_PORTFOLIO_API_URL ??
    "https://sb-4wdkkmzv7w2z.vercel.run"
  ).replace(/\/$/, "");
export const ingestSecret = (): string | undefined =>
  process.env.INGEST_SECRET?.trim() || undefined;
/** The ONE snake_case → camelCase mapping (re-exported from ./types so client code can share it). */
export const toArtifact = (w: ArtifactWire): Artifact => fromWire(w);

export type SaveArtifactInput = {
  bytes?: Uint8Array | ArrayBuffer | Buffer;
  url?: string;
  name: string;
  mime?: string;
  kind?: ArtifactKind;
  source?: ArtifactSource;
  mediaId?: string | null;
  mediaStatus?: ArtifactMediaStatus;
  mediaMessage?: string | null;
  threadId?: string | null;
  sessionId?: string | null;
  originEvent?: string | null;
  /** Unsigned OnDemand sourceUrl — any query string is stripped here AND server-side; a signed url is never persisted. */
  mediaSourceUrl?: string | null;
  mediaUrlExpiresAt?: string | null;
  mediaExternalUserId?: string | null;
  mediaPlugins?: string[] | null;
};

/** Persist an artifact via backend POST /artifacts (adds X-Ingest-Secret). Throws on failure. Used by /api/media and /api/chat in-process. */
export async function saveArtifact(
  input: SaveArtifactInput,
): Promise<Artifact> {
  const secret = ingestSecret();
  if (!secret)
    throw new Error("INGEST_SECRET is not configured on the frontend server");
  if (!input.bytes && !input.url)
    throw new Error("saveArtifact needs bytes or url");
  const mime = input.mime || "application/octet-stream";
  const body: Record<string, unknown> = {
    name: input.name,
    mime,
    kind: input.kind ?? kindFromMime(mime, input.name),
    source: input.source ?? "generated",
    media_id: input.mediaId ?? null,
    media_status: input.mediaStatus ?? null,
    media_message: input.mediaMessage ?? null,
    media_source_url: unsignedUrl(input.mediaSourceUrl),
    media_url_expires_at: input.mediaUrlExpiresAt ?? null,
    media_external_user_id: input.mediaExternalUserId ?? null,
    media_plugins: input.mediaPlugins ?? null,
    thread_id: input.threadId ?? null,
    session_id: input.sessionId ?? null,
    origin_event: input.originEvent ?? null,
  };
  if (input.bytes) {
    const u8 =
      input.bytes instanceof ArrayBuffer
        ? new Uint8Array(input.bytes)
        : new Uint8Array(
            input.bytes.buffer,
            input.bytes.byteOffset,
            input.bytes.byteLength,
          );
    body.content_base64 = Buffer.from(u8).toString("base64");
  } else body.url = input.url;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 60000);
  try {
    const r = await fetch(`${artifactsBackend()}/artifacts`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "X-Ingest-Secret": secret,
      },
      body: JSON.stringify(body),
      signal: ctl.signal,
      cache: "no-store",
    });
    const text = await r.text();
    if (!r.ok)
      throw new Error(
        `Backend POST /artifacts ${r.status}: ${text.slice(0, 300)}`,
      );
    const j = JSON.parse(text) as { data: ArtifactWire };
    return toArtifact(j.data);
  } finally {
    clearTimeout(t);
  }
}

/** List artifacts from the backend (server-side). Returns [] on failure. */
export async function listArtifacts(
  q: { threadId?: string; kind?: string; limit?: number } = {},
): Promise<{ data: Artifact[]; ok: boolean }> {
  const p = new URLSearchParams();
  if (q.threadId) p.set("thread_id", q.threadId);
  if (q.kind) p.set("kind", q.kind);
  p.set("limit", String(q.limit ?? 200));
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(`${artifactsBackend()}/artifacts?${p}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: ctl.signal,
    });
    clearTimeout(t);
    if (!r.ok) return { data: [], ok: false };
    const j = (await r.json()) as { data: ArtifactWire[] };
    return { data: (j.data ?? []).map(toArtifact), ok: true };
  } catch {
    return { data: [], ok: false };
  }
}

/** Re-sign on open (server-side): backend GET /artifacts/:id/signed-url. Returns the same-origin content url on any failure. */
export async function signedUrlFor(
  id: string,
  download = false,
): Promise<SignedUrlResult> {
  const fallback: SignedUrlResult = {
    id,
    mediaId: null,
    url: `/api/artifacts/${encodeURIComponent(id)}/content${download ? "?download=1" : ""}`,
    sourceUrl: null,
    expiresAt: null,
    source: "backend",
    mediaMessage: null,
  };
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 20000);
    const r = await fetch(
      `${artifactsBackend()}/artifacts/${encodeURIComponent(id)}/signed-url${download ? "?download=1" : ""}`,
      {
        headers: { accept: "application/json" },
        cache: "no-store",
        signal: ctl.signal,
      },
    );
    clearTimeout(t);
    if (!r.ok) return { ...fallback, mediaMessage: `Backend ${r.status}` };
    const j = (await r.json()) as { data: SignedUrlWire };
    const out = signedFromWire(j.data);
    // The backend fallback url is absolute (backend origin); keep inline/same-origin semantics by routing it through the proxy.
    if (out.source === "backend") out.url = fallback.url;
    return out;
  } catch (e) {
    return { ...fallback, mediaMessage: (e as Error).message };
  }
}

/** Version history (server-side): backend GET /artifacts/:id/versions. `null` when the artifact is unknown; throws on transport failure. */
export async function versionsFor(
  id: string,
): Promise<{
  status: number;
  body: ArtifactVersions | { code: string; message: string };
}> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(
      `${artifactsBackend()}/artifacts/${encodeURIComponent(id)}/versions`,
      {
        headers: { accept: "application/json" },
        cache: "no-store",
        signal: ctl.signal,
      },
    );
    const text = await r.text();
    if (!r.ok) {
      try {
        return { status: r.status, body: JSON.parse(text) };
      } catch {
        return {
          status: r.status,
          body: { code: "backend_error", message: text.slice(0, 200) },
        };
      }
    }
    return {
      status: 200,
      body: versionsFromWire(JSON.parse(text) as ArtifactVersionsWire),
    };
  } finally {
    clearTimeout(t);
  }
}
