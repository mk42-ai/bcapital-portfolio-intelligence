"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import "../artifacts/artifacts.css";

export type LightboxImage = { src: string; alt: string; caption?: string };
/** Full-screen image viewer: contain-fit, caption, prev/next, "2 / 3" counter, Esc/←/→, focus trap, body scroll lock. */
export function Lightbox({ images, index, onIndex, onClose }: { images: LightboxImage[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const n = images.length; const img = images[index];
  const prev = () => n > 1 && onIndex((index - 1 + n) % n);
  const next = () => n > 1 && onIndex((index + 1) % n);
  const stateRef = useRef({ prev, next, onClose }); stateRef.current = { prev, next, onClose };
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); stateRef.current.onClose(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); stateRef.current.prev(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); stateRef.current.next(); }
      else if (e.key === "Tab" && ref.current) {
        const f = Array.from(ref.current.querySelectorAll<HTMLElement>("button:not([disabled])"));
        if (!f.length) return; const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("keydown", onKey, true); document.body.style.overflow = overflow; opener?.focus?.(); };
  }, []);
  if (!img || typeof document === "undefined") return null;
  return createPortal(
    <div ref={ref} className="media-lightbox media-root" role="dialog" aria-modal="true" aria-label={`Image ${index + 1} of ${n}: ${img.alt}`} data-testid="lightbox" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="media-lightbox-bar">
        <span className="media-lightbox-counter" data-testid="lightbox-counter" aria-live="polite">{index + 1} / {n}</span>
        <span style={{ flex: 1 }} />
        <button ref={closeRef} type="button" className="media-btn" onClick={onClose} aria-label="Close image viewer" data-testid="lightbox-close"><X className="size-5" aria-hidden /></button>
      </div>
      <div className="media-lightbox-stage" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        {n > 1 && <button type="button" className="media-btn media-nav-prev" onClick={prev} aria-label="Previous image" data-testid="lightbox-prev"><ChevronLeft className="size-5" aria-hidden /></button>}
        <img src={img.src} alt={img.alt} />
        {n > 1 && <button type="button" className="media-btn media-nav-next" onClick={next} aria-label="Next image" data-testid="lightbox-next"><ChevronRight className="size-5" aria-hidden /></button>}
      </div>
      {(img.caption || img.alt) && <p className="media-lightbox-caption" data-testid="lightbox-caption">{img.caption || img.alt}</p>}
    </div>,
    document.body,
  );
}
