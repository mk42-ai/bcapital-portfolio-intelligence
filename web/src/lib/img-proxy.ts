import { ASSET, asset } from "@/lib/assets";

/**
 * Helpers for the same-origin image proxy (/api/img), shared by the client components and the route itself. Remote http(s)
 * images are routed through the proxy so hotlink 403s, mixed-content blocks and ORB never reach the browser; local assets
 * (/brand/…, /assets/…) and data: URLs stay direct. http:// URLs are upgraded to https:// (the proxy refuses plain http and the
 * browser would block it anyway).
 *
 * Fallback modes (`fb` query param): the route's default (`fb=news`) serves the local news-card asset on upstream failure so a bare
 * `<img src="/api/img?u=…">` never shows a broken icon. Components that run their own onError chain (article → logo → favicon →
 * monogram) ask for `fb=none` instead: that answers 204 so the chain advances honestly rather than settling on the placeholder.
 */
export type ProxyFallback = "news" | "none";
export const isRemoteUrl = (u: string | null | undefined): boolean => !!u && /^https?:\/\//i.test(u);

export function proxiedImage(u: string, w?: number, fb: ProxyFallback = "none"): string {
  const https = u.replace(/^http:\/\//i, "https://");
  return `/api/img?u=${encodeURIComponent(https)}${w ? `&w=${w}` : ""}${fb === "none" ? "&fb=0" : ""}`;
}

/** Proxy remote URLs, pass local/data URLs through unchanged; null for anything that is not a usable image source. */
export function imageSrc(u: string | null | undefined, w?: number, fb: ProxyFallback = "none"): string | null {
  if (!u) return null;
  if (isRemoteUrl(u)) return proxiedImage(u, w, fb);
  if (u.startsWith("/") || u.startsWith("data:")) return u;
  return null;
}

/** News-card illustration (transparent WebP) for a render of `w` CSS px: 256 below 320 px, 512 at or above. */
export const newsFallbackAsset = (w?: number): string => (w && w >= 320 ? asset("news-card", 512) : ASSET.newsCard);

/** Final-state fallback tiles. Only for the empty state — never instead of a real image. */
export const FALLBACK_NEWS_TILE: string = ASSET.newsCard;
export const FALLBACK_LOGO_TILE = ASSET.companyLogo;
