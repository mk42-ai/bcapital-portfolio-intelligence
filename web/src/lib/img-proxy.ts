/**
 * Client-side helpers for the same-origin image proxy (/api/img). Remote http(s) images are routed through the proxy so
 * hotlink 403s, mixed-content blocks and ORB never reach the browser; local assets (/brand/…, /fallbacks/…) and data: URLs
 * stay direct. http:// URLs are upgraded to https:// (the proxy refuses plain http and the browser would block it anyway).
 */
export const isRemoteUrl = (u: string | null | undefined): boolean => !!u && /^https?:\/\//i.test(u);

export function proxiedImage(u: string, w?: number): string {
  const https = u.replace(/^http:\/\//i, "https://");
  return `/api/img?u=${encodeURIComponent(https)}${w ? `&w=${w}` : ""}`;
}

/** Proxy remote URLs, pass local/data URLs through unchanged; null for anything that is not a usable image source. */
export function imageSrc(u: string | null | undefined, w?: number): string | null {
  if (!u) return null;
  if (isRemoteUrl(u)) return proxiedImage(u, w);
  if (u.startsWith("/") || u.startsWith("data:")) return u;
  return null;
}

/** Final-state fallback tiles (optimised 384 px WebP). Only for the empty state — never instead of a real image. */
export const FALLBACK_NEWS_TILE = "/fallbacks/news-tile.webp";
export const FALLBACK_LOGO_TILE = "/fallbacks/logo-tile.webp";
