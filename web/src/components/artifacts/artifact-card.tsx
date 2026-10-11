"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { Download, ExternalLink, Eye, Trash2 } from "lucide-react";
import { artifactsPanel, artifactsStore } from "@/lib/artifacts/store";
import { formatBytes, relativeTime, type Artifact } from "@/lib/artifacts/types";
import { ArtifactIcon, iconFor, kindBadge } from "./artifact-icon";
import "./artifacts.css";

/** Same-origin fallback href (inline previews and the no-JS path keep using it). */
export const downloadHref = (a: Artifact) => (a.contentUrl.startsWith("/api/artifacts/") ? `${a.contentUrl}?download=1` : a.contentUrl);

/** Confirm + DELETE. Returns true when removed. */
export async function confirmDeleteArtifact(a: Artifact): Promise<boolean> {
  if (typeof window !== "undefined" && !window.confirm(`Delete "${a.name}"${a.version > 1 ? ` (v${a.version})` : ""}? This cannot be undone.`)) return false;
  return artifactsStore.remove(a.id);
}

/**
 * Re-sign on open: ask /api/artifacts/<id>/signed-url for a FRESH OnDemand signed url (never the stored one) and open/download it; on any
 * failure the same-origin content url is used. The tab is opened synchronously (popup-blocker safe) and redirected once the url arrives.
 */
export async function openArtifact(a: Artifact, mode: "open" | "download"): Promise<string> {
  const fallback = mode === "download" ? downloadHref(a) : a.contentUrl;
  if (a.pending || !a.contentUrl.startsWith("/api/artifacts/")) { if (typeof window !== "undefined") window.open(fallback, "_blank", "noopener"); return fallback; }
  const win = typeof window !== "undefined" ? window.open("about:blank", "_blank", "noopener") : null;
  const res = await artifactsStore.signedUrl(a.id, mode === "download");
  const url = res.url || fallback;
  if (win && !win.closed) win.location.replace(url);
  else if (typeof window !== "undefined") {
    if (mode === "download" && res.source === "backend") { const el = document.createElement("a"); el.href = url; el.download = a.name; el.rel = "noopener"; document.body.appendChild(el); el.click(); el.remove(); }
    else window.location.assign(url);
  }
  return url;
}

/** Green dot only when OnDemand really holds the file; grey "stored locally" otherwise — never a fake green for failed. */
export function MediaBadge({ a }: { a: Artifact }) {
  const stored = a.mediaStatus === "stored" && !!a.mediaId;
  const failed = a.mediaStatus === "failed" || a.failed;
  const label = stored ? "OnDemand media" : failed ? "stored locally · media failed" : "stored locally";
  return <span className={`art-badge art-badge-media${stored ? " is-stored" : failed ? " is-failed" : ""}`} data-testid="artifact-media-badge" data-media={stored ? "ondemand" : "local"} title={a.mediaMessage ?? (stored ? `OnDemand media ${a.mediaId}` : "Bytes live in the portfolio backend")}><i aria-hidden />{label}</span>;
}
export const sourceLabel = (a: Artifact) => (a.source === "upload" ? "input" : a.source === "agent" ? "agent" : "generated");

/** Artifact card. `compact` = one-row inline variant for the chat run view (file_written / artifact_ready). Default Preview opens the global panel. */
export function ArtifactCard({ artifact: a, compact = false, selected = false, onPreview, onDeleted }: { artifact: Artifact; compact?: boolean; selected?: boolean; onPreview?: (a: Artifact) => void; onDeleted?: (a: Artifact) => void }) {
  const [now, setNow] = useState<number | null>(null);
  const [thumbErr, setThumbErr] = useState(false);
  const [busy, setBusy] = useState<"open" | "download" | null>(null);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);
  const state = a.failed ? "failed" : a.pending ? "uploading" : "ok";
  const icon = iconFor(a.kind, a.mime, a.name, state, a.source);
  const preview = () => (onPreview ? onPreview(a) : artifactsPanel.open(a.id));
  const badge = kindBadge(a.kind, a.mime, a.name);
  const metaBits = [a.sizeBytes ? formatBytes(a.sizeBytes) : null, `v${a.version}`, now ? relativeTime(a.createdAt, now) : null].filter(Boolean) as string[];
  const showThumb = a.kind === "image" && a.thumbnailUrl && !thumbErr && !a.pending && !compact;
  const act = async (mode: "open" | "download") => { if (busy) return; setBusy(mode); try { await openArtifact(a, mode); } finally { setBusy(null); } };
  const canOpen = !!a.contentUrl && !a.pending;
  return (
    <article className={`art-card art-root${compact ? " is-compact" : ""}`} data-testid="artifact-card" data-kind={a.kind} data-icon={icon} data-id={a.id} data-selected={selected ? "true" : "false"} aria-label={`${a.name}, ${badge}, ${metaBits.join(", ")}`}>
      <div className="art-thumb" aria-hidden={showThumb ? undefined : true}>
        {showThumb ? <img src={a.thumbnailUrl!} alt="" loading="lazy" decoding="async" onError={() => setThumbErr(true)} /> : <ArtifactIcon name={icon} size={compact ? 28 : 36} />}
      </div>
      <div className="art-card-main">
        <div className="art-card-row">
          <p className="art-card-name" title={a.name}>{a.name}</p>
          <span className="art-badge art-badge-kind" data-testid="artifact-kind">{badge}</span>
          {!compact && <span className={`art-badge art-badge-source is-${sourceLabel(a)}`} data-testid="artifact-source">{sourceLabel(a)}</span>}
        </div>
        <p className="art-card-meta">
          {metaBits.map((b, i) => <span key={i}>{i > 0 && <span className="art-dot" aria-hidden> · </span>}{b}</span>)}
          {compact && <><span className="art-dot" aria-hidden> · </span><MediaBadge a={a} /></>}
        </p>
        {!compact && <div className="art-card-badges"><MediaBadge a={a} />{a.threadId && <span className="art-badge" title={a.threadId}>Thread {a.threadId.slice(0, 8)}</span>}</div>}
        {state !== "ok" && <span className={`art-card-status${state === "failed" ? " is-failed" : ""}`} role="status">{state === "failed" ? (a.mediaMessage || "Saving failed") : "Saving…"}</span>}
        {state === "ok" && a.mediaStatus === "failed" && !compact && <span className="art-card-status is-failed" role="status">{a.mediaMessage || "Saving to OnDemand media failed — stored in the backend"}</span>}
        <div className="art-card-actions">
          {!compact && <button type="button" className="art-btn" onClick={preview} data-testid="artifact-preview-btn" disabled={!a.contentUrl}><Eye aria-hidden />Preview</button>}
          <button type="button" className="art-btn" onClick={() => act("open")} data-testid="artifact-open" disabled={!canOpen || busy === "open"} title="Open (fresh signed url)"><ExternalLink aria-hidden />{busy === "open" ? "Opening…" : "Open"}</button>
          <button type="button" className="art-btn" onClick={() => act("download")} data-testid="artifact-download" disabled={!canOpen || busy === "download"} title="Download (fresh signed url)"><Download aria-hidden />{busy === "download" ? "…" : "Download"}</button>
          {!compact && <button type="button" className="art-btn is-danger" data-testid="artifact-delete" onClick={async () => { if (await confirmDeleteArtifact(a)) onDeleted?.(a); }}><Trash2 aria-hidden />Delete</button>}
        </div>
      </div>
    </article>
  );
}
