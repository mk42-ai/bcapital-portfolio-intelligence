"use client";
import { useSyncExternalStore } from "react";
/**
 * Side-pane store (Lane E contract). Anything that wants to open a document / video / image NEXT TO the chat calls `openSidePane()`;
 * `<SidePane />` (web/src/components/media/side-pane.tsx) subscribes with `useSidePane()` and renders the preview beside the thread.
 * Videos never autoplay in the stream — the stream shows a poster + play button and playback happens here.
 * State is module-level so it survives re-renders of the chat tree; `closeSidePane()` resets it to null.
 */
export type SidePaneItem = {
  kind: "document" | "video" | "image";
  /** Same-origin or signed URL to render (iframe/object for documents, <video> for video, <img> for image). */
  src: string;
  title: string;
  mime?: string;
  poster?: string;
  /** Backend artifact id (when the item is a stored artifact) — lets the pane re-sign / download via /api/artifacts/<id>/… */
  artifactId?: string;
  downloadUrl?: string;
  /** Optional byte size (shown for formats without an in-browser renderer). */
  size?: number;
};
let state: SidePaneItem | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
export const openSidePane = (item: SidePaneItem) => { state = item; emit(); };
export const closeSidePane = () => { state = null; emit(); };
export const getSidePane = () => state;
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useSidePane = () => useSyncExternalStore(subscribe, () => state, () => null);

/** Minimal artifact shape (structurally compatible with the artifacts module — no import from there to keep this file dependency-free). */
export type PaneArtifact = { id: string; name: string; mime?: string | null; kind?: string | null; contentUrl: string; size?: number | null; poster?: string | null };

/** Map an artifact's kind/mime to a SidePaneItem kind. Images and videos get their own renderers; everything else is a "document". */
export function paneKindFor(a: { mime?: string | null; kind?: string | null; name?: string }): SidePaneItem["kind"] {
  const mime = (a.mime ?? "").toLowerCase(); const kind = (a.kind ?? "").toLowerCase(); const name = (a.name ?? "").toLowerCase();
  if (kind === "image" || mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/.test(name)) return "image";
  if (kind === "video" || mime.startsWith("video/") || /\.(mp4|webm|mov|m4v|ogv)$/.test(name)) return "video";
  return "document";
}

/** Open a stored artifact side-by-side with the chat (Lane C wires ArtifactCard's "Open" to this). Pure mapping + openSidePane(). */
export function openArtifactInPane(a: PaneArtifact): SidePaneItem {
  const kind = paneKindFor(a);
  const sep = a.contentUrl.includes("?") ? "&" : "?";
  const item: SidePaneItem = {
    kind,
    src: a.contentUrl,
    title: a.name,
    mime: a.mime ?? undefined,
    artifactId: a.id,
    downloadUrl: kind === "document" ? `${a.contentUrl}${sep}download=1` : a.contentUrl,
    poster: a.poster ?? undefined,
    size: a.size ?? undefined,
  };
  openSidePane(item);
  return item;
}
