"use client";
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { Lightbox, type LightboxImage } from "./lightbox";
import "./media.css";

export type GridImage = LightboxImage;
/** Inline image thumbnails in the stream (fixed height 180px / 120px ≤640px, cover-fit); click a tile → Lightbox. */
export function ImageGrid({ images, className }: { images: GridImage[]; className?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!images.length) return null;
  const cols = images.length === 1 ? 1 : images.length === 2 || images.length === 4 ? 2 : 3;
  return (
    <>
      <div className={["mp-grid mp-root media-grid", className].filter(Boolean).join(" ")} data-cols={cols} data-testid="image-grid">
        {images.map((im, i) => (
          <button key={`${im.src}-${i}`} type="button" className="mp-thumb media-tile" onClick={() => setOpen(i)} aria-label={`Open image ${i + 1} of ${images.length}: ${im.alt}`} data-testid="image-grid-tile">
            <img src={im.src} alt={im.alt} loading="lazy" decoding="async" data-testid="image-thumb" />
            {im.caption && <span className="mp-thumb-caption">{im.caption}</span>}
          </button>
        ))}
      </div>
      {open !== null && <Lightbox images={images} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </>
  );
}
export { Lightbox };
