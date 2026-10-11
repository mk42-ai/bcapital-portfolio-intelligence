/** Shared Artifact shape (camelCase) used across the web app. The backend speaks snake_case; see `fromWire()` in ./server.ts. */
export type ArtifactKind = "document" | "image" | "video" | "audio" | "file";
export type ArtifactSource = "upload" | "generated" | "agent";
export type ArtifactMediaStatus = "stored" | "local" | "failed" | null;
export type Artifact = {
  id: string;
  name: string;
  kind: ArtifactKind;
  mime: string;
  sizeBytes: number;
  version: number;
  source: ArtifactSource;
  mediaId: string | null;
  mediaStatus: ArtifactMediaStatus;
  mediaMessage: string | null;
  /** UNSIGNED OnDemand sourceUrl (never a signed link). The signed link is minted on open via /api/artifacts/<id>/open. */
  mediaUrl: string | null;
  threadId: string | null;
  sessionId: string | null;
  originEvent: string | null;
  /** Same-origin: /api/artifacts/<id>/content */
  contentUrl: string;
  thumbnailUrl: string | null;
  createdAt: string;
  /** Client-only: optimistic entry not yet confirmed by the backend. */
  pending?: boolean;
  /** Client-only: optimistic entry that failed to persist. */
  failed?: boolean;
};
/** Backend wire shape (snake_case). */
export type ArtifactWire = {
  id: string; name: string; kind: ArtifactKind; mime: string; size_bytes: number; version: number; source: ArtifactSource;
  media_id: string | null; media_status: ArtifactMediaStatus; media_message: string | null; media_url?: string | null; thread_id: string | null; session_id: string | null;
  origin_event: string | null; content_url: string; thumbnail_url: string | null; created_at: string; deleted_at?: string | null;
};
export type ArtifactFilter = "all" | "document" | "image" | "video" | "upload";
/** Result of GET /api/artifacts/<id>/open — a fresh signed url (or the same-origin content url when re-signing is not possible). */
export type ArtifactOpen = { id: string; url: string; signed: boolean; resign: string; sourceUrl: string | null; contentUrl: string; mediaId: string | null; extractedTextUrl?: string | null; checkedAt: string };
/** Ask the server to re-sign the artifact's media link (signed OnDemand URLs expire). Always resolves — falls back to contentUrl. */
export async function openArtifactLink(a: Pick<Artifact, "id" | "contentUrl" | "mediaId">): Promise<ArtifactOpen> {
  const fallback: ArtifactOpen = { id: a.id, url: a.contentUrl, signed: false, resign: "fallback", sourceUrl: null, contentUrl: a.contentUrl, mediaId: a.mediaId, checkedAt: new Date().toISOString() };
  if (!a.id || !a.contentUrl.startsWith("/api/artifacts/")) return fallback;
  try {
    const r = await fetch(`/api/artifacts/${encodeURIComponent(a.id)}/open`, { cache: "no-store", headers: { accept: "application/json" } });
    if (!r.ok) return { ...fallback, resign: `http_${r.status}` };
    const j = (await r.json()) as { data?: Partial<ArtifactOpen> };
    return { ...fallback, ...(j.data ?? {}), url: typeof j.data?.url === "string" && j.data.url ? j.data.url : a.contentUrl };
  } catch (e) { return { ...fallback, resign: `error: ${(e as Error).message.slice(0, 80)}` }; }
}
export const ARTIFACT_KINDS: readonly ArtifactKind[] = ["document", "image", "video", "audio", "file"];

/** Pure snake_case → camelCase mapping; rewrites content/thumbnail URLs to the same-origin proxy. Safe on client and server. */
export function fromWire(w: ArtifactWire): Artifact {
  const contentUrl = `/api/artifacts/${encodeURIComponent(w.id)}/content`;
  return {
    id: w.id, name: w.name, kind: (ARTIFACT_KINDS as string[]).includes(w.kind) ? w.kind : "file", mime: w.mime || "application/octet-stream",
    sizeBytes: Number(w.size_bytes) || 0, version: Number(w.version) || 1, source: w.source ?? "generated",
    mediaId: w.media_id ?? null, mediaStatus: w.media_status ?? null, mediaMessage: w.media_message ?? null, mediaUrl: w.media_url ?? null,
    threadId: w.thread_id ?? null, sessionId: w.session_id ?? null, originEvent: w.origin_event ?? null,
    contentUrl, thumbnailUrl: w.thumbnail_url ? contentUrl : (w.kind === "image" ? contentUrl : null), createdAt: w.created_at,
  };
}
/** Infer a kind from a mime type / filename. */
export function kindFromMime(mime?: string | null, name?: string | null): ArtifactKind {
  const m = (mime ?? "").toLowerCase(); const n = (name ?? "").toLowerCase();
  if (m.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|avif)$/.test(n)) return "image";
  if (m.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/.test(n)) return "video";
  if (m.startsWith("audio/") || /\.(mp3|wav|ogg|m4a)$/.test(n)) return "audio";
  if (m.includes("pdf") || m.startsWith("text/") || m.includes("word") || m.includes("officedocument") || m.includes("json") || /\.(pdf|docx?|md|txt|html?|csv|xlsx?|pptx?)$/.test(n)) return "document";
  return "file";
}
export function formatBytes(n: number): string {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"]; let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
}
export function relativeTime(iso: string, now = Date.now()): string {
  const t = Date.parse(iso); if (Number.isNaN(t)) return "";
  const s = Math.round((now - t) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
