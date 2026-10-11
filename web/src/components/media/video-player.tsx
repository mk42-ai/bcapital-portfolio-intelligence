"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { Film, Play } from "lucide-react";
import { openSidePane } from "./side-pane-store";
import "./media.css";

const posterCache = new Map<string, string | null>();
/** Lazily grab a poster frame (t≈0.5s) from an off-screen muted <video preload="metadata">; resolves null on CORS/decode failure. */
function capturePoster(src: string): Promise<string | null> {
  if (posterCache.has(src)) return Promise.resolve(posterCache.get(src) ?? null);
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: string | null) => { if (done) return; done = true; posterCache.set(src, v); cleanup(); resolve(v); };
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.preload = "metadata"; v.crossOrigin = "anonymous";
    v.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none";
    const timer = window.setTimeout(() => finish(null), 8000);
    const cleanup = () => { window.clearTimeout(timer); v.removeAttribute("src"); try { v.load(); } catch { /* noop */ } v.remove(); };
    v.addEventListener("error", () => finish(null), { once: true });
    v.addEventListener("loadedmetadata", () => { try { v.currentTime = Math.min(0.5, Math.max(0, (v.duration || 1) - 0.1)); } catch { finish(null); } }, { once: true });
    v.addEventListener("seeked", () => {
      try {
        const w = v.videoWidth, h = v.videoHeight; if (!w || !h) return finish(null);
        const c = document.createElement("canvas"); const scale = Math.min(1, 640 / w); c.width = Math.round(w * scale); c.height = Math.round(h * scale);
        const ctx = c.getContext("2d"); if (!ctx) return finish(null);
        ctx.drawImage(v, 0, 0, c.width, c.height);
        finish(c.toDataURL("image/jpeg", 0.8)); // throws SecurityError on a tainted canvas (cross-origin without CORS)
      } catch { finish(null); }
    }, { once: true });
    document.body.appendChild(v);
    v.src = src;
  });
}

/** Stream representation of a video: POSTER FRAME + centered play button only (no <video controls>, no autoplay, no media preload beyond the
 *  poster). Play → openSidePane({kind:"video"}) where the real player lives. Keeps the `VideoPlayer` name + props chat-shell passes. */
export function VideoPlayer({ src, poster, title, className }: { src: string; poster?: string; title?: string; className?: string }) {
  const [frame, setFrame] = useState<string | null | undefined>(poster ?? (posterCache.has(src) ? posterCache.get(src) : undefined));
  useEffect(() => {
    if (poster) { setFrame(poster); return; }
    let alive = true;
    capturePoster(src).then((p) => { if (alive) setFrame(p); });
    return () => { alive = false; };
  }, [src, poster]);
  const label = title ?? "Video";
  const play = () => openSidePane({ kind: "video", src, title: label, poster: frame ?? undefined });
  return (
    <div className={["mp-video mp-root media-video", className].filter(Boolean).join(" ")} data-testid="video-player" data-poster-state={frame === undefined ? "loading" : frame ? "ready" : "fallback"} onClick={play} role="presentation">
      {frame
        ? <img className="mp-video-poster" src={frame} alt="" data-testid="video-poster" draggable={false} />
        : <div className="mp-video-placeholder" data-testid="video-poster" aria-hidden><Film className="size-10" aria-hidden /></div>}
      <button type="button" className="mp-video-play" onClick={(e) => { e.stopPropagation(); play(); }} aria-label={`Play ${label}`} title="Play" data-testid="video-play"><Play className="size-7" aria-hidden /></button>
      <div className="mp-video-title"><Film className="size-4 shrink-0" aria-hidden /><span title={label}>{label}</span></div>
    </div>
  );
}
