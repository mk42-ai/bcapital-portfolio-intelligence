"use client";
import { useSyncExternalStore } from "react";
/**
 * Side-pane store (Lane E contract). Anything that wants to open a document / video / image NEXT TO the chat calls `openSidePane()`;
 * `<SidePane />` (web/src/components/media/side-pane.tsx) subscribes with `useSidePane()` and renders the preview beside the thread.
 * Videos never autoplay in the stream — the stream shows a poster + play button and playback happens here.
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
};
let state: SidePaneItem | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
export const openSidePane = (item: SidePaneItem) => { state = item; emit(); };
export const closeSidePane = () => { state = null; emit(); };
export const getSidePane = () => state;
export const useSidePane = () => useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => state, () => null);
