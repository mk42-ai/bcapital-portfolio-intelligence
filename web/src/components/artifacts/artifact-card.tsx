"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { Download, Eye, Trash2 } from "lucide-react";
import { artifactsPanel, artifactsStore } from "@/lib/artifacts/store";
import { formatBytes, relativeTime, type Artifact } from "@/lib/artifacts/types";
import { ArtifactIcon } from "./artifact-icon";
import "./artifacts.css";

export const downloadHref = (a: Artifact) => (a.contentUrl.startsWith("/api/artifacts/") ? `${a.contentUrl}?download=1` : a.contentUrl);

/** Confirm + DELETE. Returns true when removed. */
export async function confirmDeleteArtifact(a: Artifact): Promise<boolean> {
  if (typeof window !== "undefined" && !window.confirm(`Delete "${a.name}"${a.version > 1 ? ` (v${a.version})` : ""}? This cannot be undone.`)) return false;
  return artifactsStore.remove(a.id);
}

/** Inline artifact card (chat + panel + page). Default Preview opens the global panel on this artifact. */
export function ArtifactCard({ artifact: a, compact = false, selected = false, onPreview, onDeleted }: { artifact: Artifact; compact?: boolean; selected?: boolean; onPreview?: (a: Artifact) => void; onDeleted?: (a: Artifact) => void }) {
  const [now, setNow] = useState<number | null>(null);
  const [thumbErr, setThumbErr] = useState(false);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);
  const state = a.failed || a.mediaStatus === "failed" ? "failed" : a.pending ? "uploading" : "ok";
  const preview = () => (onPreview ? onPreview(a) : artifactsPanel.open(a.id));
  const kindLabel = a.kind === "file" ? (a.mime.split("/")[1]?.toUpperCase() || "File") : a.kind[0].toUpperCase() + a.kind.slice(1);
  const meta = [kindLabel, a.sizeBytes ? formatBytes(a.sizeBytes) : null, `v${a.version}`, now ? relativeTime(a.createdAt, now) : null].filter(Boolean).join(" · ");
  const showThumb = a.kind === "image" && a.thumbnailUrl && !thumbErr && !a.pending;
  return (
    <article className={`art-card art-root${compact ? " is-compact" : ""}`} data-testid="artifact-card" data-kind={a.kind} data-id={a.id} data-selected={selected ? "true" : "false"} aria-label={`${a.name}, ${meta}`}>
      <div className="art-thumb" aria-hidden={showThumb ? undefined : true}>
        {showThumb ? <img src={a.thumbnailUrl!} alt="" loading="lazy" onError={() => setThumbErr(true)} /> : <ArtifactIcon kind={a.kind} source={a.source} state={state} size={32} />}
      </div>
      <div className="art-card-main">
        <p className="art-card-name" title={a.name}>{a.name}</p>
        <p className="art-card-meta">{meta}</p>
        {state !== "ok" && <span className={`art-card-status${state === "failed" ? " is-failed" : ""}`} role="status">{state === "failed" ? (a.mediaMessage || "Saving to media storage failed") : "Saving…"}</span>}
        <div className="art-card-actions">
          <button type="button" className="art-btn" onClick={preview} data-testid="artifact-preview-btn" disabled={!a.contentUrl}><Eye aria-hidden />Preview</button>
          {a.contentUrl && <a className="art-btn" href={downloadHref(a)} download={a.name} data-testid="artifact-download"><Download aria-hidden />Download</a>}
          {!compact && <button type="button" className="art-btn is-danger" data-testid="artifact-delete" onClick={async () => { if (await confirmDeleteArtifact(a)) onDeleted?.(a); }}><Trash2 aria-hidden />Delete</button>}
        </div>
      </div>
    </article>
  );
}
