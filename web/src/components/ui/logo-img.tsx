"use client";
import { useEffect, useState, type CSSProperties, type SyntheticEvent } from "react";

/** First letter of the name (first non-space character), upper-cased; "?" when empty. */
export const monogramInitial = (name: string) => (name.trim().match(/[\p{L}\p{N}]/u)?.[0] ?? name.trim()[0] ?? "?").toUpperCase();

/** True when `name` yields a real letter/digit monogram (not empty, not "?" / punctuation) — callers otherwise show an asset. */
export const hasMonogram = (name?: string | null) => !!name && /[\p{L}\p{N}]/u.test(monogramInitial(name));

/**
 * Serif-initial tile used whenever a real logo cannot be shown. Pure CSS/typography — never a generated image.
 * `testId` lets CompanyLogo keep its legacy `company-logo-fallback` testid for the e2e suite; it always carries the
 * `logo-monogram` class too so the audit/QA can select every monogram uniformly.
 */
export function LogoMonogram({ name, size = 20, className = "", testId = "logo-monogram", style }: { name: string; size?: number; className?: string; testId?: string; style?: CSSProperties }) {
  return (
    <span data-testid={testId} role="img" aria-label={name} title={name}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.5)), ...style }}
      className={`logo-monogram inline-grid shrink-0 select-none place-items-center overflow-hidden rounded-md border border-border bg-surface-2 font-display font-semibold leading-none text-foreground ${className}`}>
      {monogramInitial(name)}
    </span>
  );
}

export type LogoImgProps = {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
  /** Alt text for the image; defaults to "" (decorative — the monogram carries the aria-label on fallback). */
  alt?: string;
  eager?: boolean;
  /** Optional extra classes applied only to the <img> (e.g. object-fit/padding tweaks). */
  imgClassName?: string;
  style?: CSSProperties;
};

/**
 * Logo <img> with a built-in monogram fallback: a missing/invalid src, a decode error (`onError`) or a "successful" load
 * whose `naturalWidth === 0` (broken SVG, HTML served as image, 1×1 tracking pixel) all swap to a serif-initial tile.
 */
export function LogoImg({ src, name, size = 20, className = "", alt = "", eager = false, imgClassName = "", style }: LogoImgProps) {
  const valid = !!src && (/^https?:\/\//i.test(src) || src.startsWith("/") || src.startsWith("data:"));
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]); // a new src gets a fresh chance
  if (!valid || failed) return <LogoMonogram name={name} size={size} className={className} style={style} />;
  const onLoad = (e: SyntheticEvent<HTMLImageElement>) => { if (e.currentTarget.naturalWidth === 0) setFailed(true); };
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img data-testid="logo-img" src={src as string} alt={alt} title={alt ? undefined : name} width={size} height={size}
      loading={eager ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer" fetchPriority={eager ? "high" : "low"}
      onError={() => setFailed(true)} onLoad={onLoad}
      style={{ width: size, height: size, ...style }}
      className={`shrink-0 object-contain ${className} ${imgClassName}`} />
  );
}
