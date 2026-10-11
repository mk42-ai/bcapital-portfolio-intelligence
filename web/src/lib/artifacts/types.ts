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
  /** UNSIGNED OnDemand sourceUrl (query string stripped). Open/Download re-sign via /api/artifacts/<id>/signed-url. */
  mediaSourceUrl: string | null;
  /** SAS `se=` seen at registration (informational; may be in the past — never used to build a URL). */
  mediaUrlExpiresAt: string | null;
  mediaExternalUserId: string | null;
  mediaPlugins: string[] | null;
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
  media_id: string | null; media_status: ArtifactMediaStatus; media_message: string | null;
  media_source_url?: string | null; media_url_expires_at?: string | null; media_external_user_id?: string | null; media_plugins?: string[] | string | null;
  thread_id: string | null; session_id: string | null;
  origin_event: string | null; content_url: string; thumbnail_url: string | null; created_at: string; deleted_at?: string | null;
};
export type ArtifactFilter = "all" | "document" | "image" | "video" | "audio" | "upload" | "generated";
export type ArtifactDateFilter = "today" | "7d" | "30d" | "all";
/** Response of GET /api/artifacts/<id>/signed-url (backend /artifacts/:id/signed-url). */
export type SignedUrlResult = { id: string; mediaId: string | null; url: string; sourceUrl: string | null; expiresAt: string | null; source: "ondemand" | "backend"; mediaMessage: string | null };
export type SignedUrlWire = { id: string; media_id: string | null; url: string; source_url?: string | null; expires_at?: string | null; source: "ondemand" | "backend"; media_message?: string | null };
/** One row of GET /api/artifacts/<id>/versions (backend /artifacts/:id/versions). */
export type ArtifactVersionRow = { id: string; version: number; sizeBytes: number; createdAt: string; mediaStatus: ArtifactMediaStatus; mediaId: string | null; source: ArtifactSource; contentUrl: string };
export type ArtifactVersions = { name: string; threadId: string | null; latestVersion: number; versions: ArtifactVersionRow[] };
export type ArtifactVersionsWire = { data: { id: string; version: number; size_bytes: number; created_at: string; media_status?: ArtifactMediaStatus; media_id?: string | null; source: ArtifactSource; content_url?: string }[]; name: string; thread_id: string | null; latest_version: number };
export const versionsFromWire = (w: ArtifactVersionsWire): ArtifactVersions => ({
  name: w.name, threadId: w.thread_id ?? null, latestVersion: Number(w.latest_version) || 1,
  versions: (w.data ?? []).map((v) => ({ id: v.id, version: Number(v.version) || 1, sizeBytes: Number(v.size_bytes) || 0, createdAt: v.created_at, mediaStatus: v.media_status ?? null, mediaId: v.media_id ?? null, source: v.source ?? "generated", contentUrl: `/api/artifacts/${encodeURIComponent(v.id)}/content` })),
});
/** Verified/status chip state. "verified" = bytes are in the backend AND (OnDemand media stored with an id, OR an agent/generated output whose content url answers). */
export type ArtifactStatus = "verified" | "processing" | "local" | "failed";
export function artifactStatus(a: Pick<Artifact, "pending" | "failed" | "mediaStatus" | "mediaId" | "source" | "contentUrl" | "sizeBytes">, contentOk?: boolean | null): ArtifactStatus {
  if (a.failed || a.mediaStatus === "failed") return "failed";
  if (a.pending) return "processing";
  const hasBytes = a.sizeBytes > 0 && a.contentUrl.startsWith("/api/artifacts/");
  if (!hasBytes) return "local";
  if (a.mediaStatus === "stored" && !!a.mediaId) return "verified";
  if ((a.source === "generated" || a.source === "agent") && contentOk !== false) return "verified";
  return "local";
}
export const signedFromWire = (w: SignedUrlWire): SignedUrlResult => ({ id: w.id, mediaId: w.media_id ?? null, url: w.url, sourceUrl: w.source_url ?? null, expiresAt: w.expires_at ?? null, source: w.source === "ondemand" ? "ondemand" : "backend", mediaMessage: w.media_message ?? null });
/** Strip the query string + fragment (SAS `se=`/`sig=`) — the only form of a media URL that may be persisted. */
export function unsignedUrl(u: string | null | undefined): string | null {
  if (!u || !/^https?:\/\//i.test(u.trim())) return null;
  return u.trim().replace(/[?#].*$/, "") || null;
}
/** `se=` (SAS expiry) of a signed URL → ISO string, or null. */
export function expiryFromSignedUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try { const se = new URL(u).searchParams.get("se"); if (!se) return null; const t = Date.parse(se); return Number.isNaN(t) ? null : new Date(t).toISOString(); } catch { return null; }
}
function pluginsFromWire(v: string[] | string | null | undefined): string[] | null {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string" && v.trim()) { try { const j = JSON.parse(v); return Array.isArray(j) ? j.map(String) : null; } catch { return null; } }
  return null;
}
export const ARTIFACT_KINDS: readonly ArtifactKind[] = ["document", "image", "video", "audio", "file"];

/** Pure snake_case → camelCase mapping; rewrites content/thumbnail URLs to the same-origin proxy. Safe on client and server. */
export function fromWire(w: ArtifactWire): Artifact {
  const contentUrl = `/api/artifacts/${encodeURIComponent(w.id)}/content`;
  return {
    id: w.id, name: w.name, kind: (ARTIFACT_KINDS as string[]).includes(w.kind) ? w.kind : "file", mime: w.mime || "application/octet-stream",
    sizeBytes: Number(w.size_bytes) || 0, version: Number(w.version) || 1, source: w.source ?? "generated",
    mediaId: w.media_id ?? null, mediaStatus: w.media_status ?? null, mediaMessage: w.media_message ?? null,
    mediaSourceUrl: unsignedUrl(w.media_source_url), mediaUrlExpiresAt: w.media_url_expires_at ?? null, mediaExternalUserId: w.media_external_user_id ?? null, mediaPlugins: pluginsFromWire(w.media_plugins),
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
