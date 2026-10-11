"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2, Video } from "lucide-react";
import "../artifacts/artifacts.css";

/** Native <video> wrapper with title bar + expand (Fullscreen API on the element, modal fallback where unsupported e.g. iOS Safari on non-video). */
export function VideoPlayer({ src, poster, title, className }: { src: string; poster?: string; title?: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [modal, setModal] = useState(false);
  useEffect(() => {
    if (!modal) return;
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setModal(false); } };
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("keydown", onKey, true); document.body.style.overflow = overflow; };
  }, [modal]);
  const expand = async () => {
    const el = ref.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (el?.requestFullscreen && document.fullscreenEnabled) { try { await el.requestFullscreen(); return; } catch { /* fall through */ } }
    if (el?.webkitEnterFullscreen) { try { el.webkitEnterFullscreen(); return; } catch { /* fall through */ } }
    setModal(true);
  };
  const bar = (inModal: boolean) => (
    <div className="media-video-bar">
      <Video className="size-4 shrink-0" aria-hidden />
      <span className="media-video-title" title={title}>{title ?? "Video"}</span>
      <button type="button" className="art-icon-btn" onClick={inModal ? () => setModal(false) : expand} aria-label={inModal ? "Exit expanded video" : "Expand video"} data-testid={inModal ? "video-collapse" : "video-expand"}>
        {inModal ? <Minimize2 className="size-4" aria-hidden /> : <Maximize2 className="size-4" aria-hidden />}
      </button>
    </div>
  );
  return (
    <div className={["media-video media-root", className].filter(Boolean).join(" ")} data-testid="video-player">
      {bar(false)}
      {!modal && <video ref={ref} src={src} poster={poster} controls playsInline preload="metadata" aria-label={title ?? "Video"}>Your browser cannot play this video.</video>}
      {modal && typeof document !== "undefined" && createPortal(
        <div className="media-video-modal" role="dialog" aria-modal="true" aria-label={title ?? "Video"} data-testid="video-modal">
          {bar(true)}
          <video src={src} poster={poster} controls playsInline autoPlay preload="metadata" aria-label={title ?? "Video"} />
        </div>, document.body)}
    </div>
  );
}
