"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, ExternalLink, RefreshCw, X } from "lucide-react";
import { closeSidePane, useSidePane, type SidePaneItem } from "./side-pane-store";
import { openArtifactLink, type ArtifactOpen } from "@/lib/artifacts/types";
import "../artifacts/artifacts.css";

/**
 * Side-by-side preview pane (Lane C/E). Documents open NEXT TO the chat (iframe/object), videos PLAY here (poster + play in the stream,
 * never autoplay there), images render contain-fit. Every open goes through /api/artifacts/<id>/open first so the link is re-signed —
 * signed OnDemand URLs expire (14 / 17 Oct 2026 for this week's), the backend copy is the fallback, so nothing dies.
 * Mounted once in the Shell; on ≤1023 px it becomes a bottom sheet. Esc closes; focus returns to the opener.
 */
export function SidePane() {
  const item = useSidePane();
  const [link, setLink] = useState<ArtifactOpen | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!item) { setLink(null); return; }
    opener.current = (document.activeElement as HTMLElement) ?? null;
    let live = true; setBusy(true);
    (async () => {
      const r = item.artifactId ? await openArtifactLink({ id: item.artifactId, contentUrl: item.src, mediaId: null }) : null;
      if (!live) return;
      setLink(r); setBusy(false);
      requestAnimationFrame(() => ref.current?.focus());
    })();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector("[data-testid='lightbox']")) { e.preventDefault(); closeSidePane(); } };
    window.addEventListener("keydown", onKey);
    return () => { live = false; window.removeEventListener("keydown", onKey); opener.current?.focus?.(); };
  }, [item]);
  if (!item || typeof document === "undefined") return null;
  // The pane renders the SAME-ORIGIN copy (iframe-able, no CORS) and exposes the fresh signed link for "Open in OnDemand media" / download.
  const src = item.src;
  const external = link?.signed ? link.url : null;
  const download = item.downloadUrl ?? (item.artifactId ? `${item.src}${item.src.includes("?") ? "&" : "?"}download=1` : item.src);
  return createPortal(
    <aside ref={ref} tabIndex={-1} className="media-pane media-root" role="complementary" aria-label={`Preview: ${item.title}`} data-testid="side-pane" data-kind={item.kind} data-resign={link?.resign ?? (busy ? "pending" : "n/a")} data-signed={link?.signed ? "true" : "false"}>
      <div className="media-pane-bar">
        <span className="media-pane-title" title={item.title}>{item.title}</span>
        <span className="media-pane-status" data-testid="side-pane-status">{busy ? <><RefreshCw className="size-3 oiu-spin" aria-hidden /> re-signing link…</> : link ? (link.signed ? "link re-signed" : link.resign === "fallback" || link.resign === "no_media_id" ? "backend copy" : `backend copy · ${link.resign}`) : null}</span>
        {external && <a className="art-icon-btn" href={external} target="_blank" rel="noopener noreferrer" aria-label="Open the re-signed media link in a new tab" title="Open re-signed link" data-testid="side-pane-external"><ExternalLink className="size-4" aria-hidden /></a>}
        <a className="art-icon-btn" href={download} download={item.title} aria-label="Download" title="Download" data-testid="side-pane-download"><Download className="size-4" aria-hidden /></a>
        <button type="button" className="art-icon-btn" onClick={closeSidePane} aria-label="Close preview" data-testid="side-pane-close"><X className="size-4" aria-hidden /></button>
      </div>
      <div className="media-pane-body">
        {item.kind === "video" && <video key={src} src={src} poster={item.poster} controls autoPlay playsInline preload="metadata" aria-label={item.title} data-testid="side-pane-video">Your browser cannot play this video.</video>}
        {item.kind === "image" && <img src={src} alt={item.title} className="media-pane-img" />}
        {item.kind === "document" && (/\.(md|txt|csv|json|log)$/i.test(item.title) || (item.mime ?? "").startsWith("text/")
          ? <iframe className="media-pane-frame" src={src} title={`Preview of ${item.title}`} sandbox="" />
          : <iframe className="media-pane-frame" src={src} title={`Preview of ${item.title}`} />)}
      </div>
    </aside>, document.body);
}
/** Helper for cards/buttons: open an artifact in the side pane by kind. */
export function paneItemFor(a: { id: string; name: string; kind: string; mime: string; contentUrl: string; thumbnailUrl?: string | null }): SidePaneItem {
  const kind: SidePaneItem["kind"] = a.kind === "video" ? "video" : a.kind === "image" ? "image" : "document";
  return { kind, src: a.contentUrl, title: a.name, mime: a.mime, artifactId: a.id, poster: a.kind === "video" ? a.thumbnailUrl ?? undefined : undefined, downloadUrl: a.contentUrl.startsWith("/api/artifacts/") ? `${a.contentUrl}?download=1` : a.contentUrl };
}
