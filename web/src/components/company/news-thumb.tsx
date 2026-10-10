"use client";
import { useEffect, useState, type SyntheticEvent } from "react";
import { LogoMonogram } from "@/components/ui/logo-img";
import { resolveLogo } from "@/lib/local-logos";
import { FALLBACK_NEWS_TILE, imageSrc, isRemoteUrl } from "@/lib/img-proxy";

/**
 * News thumbnail with a REAL-image fallback chain (never an AI/placeholder graphic in place of a real image):
 *   1. the article's own image, fetched through the same-origin proxy (/api/img — defeats hotlink 403s, mixed content, ORB)
 *   2. the company's official logo (local LOCAL_LOGOS asset served direct, or the backend `logo_url` via the proxy)
 *   3. the publisher's favicon (Google S2 service, 128 px, via the proxy)
 *   4. a serif-initial monogram tile when the company name is known
 *   5. the transparent news-card asset (ASSET.newsCard) centred on a neutral #f3f4f6 tile (data-testid="news-image-placeholder")
 *      as the very last resort
 * Each step only advances on a decode error (the proxy is asked for `fb=none`, so it answers 204 on any failure — which the browser
 * reports as an error — instead of serving the news-card asset in place of a real image) or a zero-width "successful" load. Every step renders the SAME 96×96 bordered rounded box so the swap causes no layout shift.
 */
const BOX = "size-24 shrink-0 rounded-lg border border-border";

export function NewsThumb({ src, companyLogo, companyName, companySlug, host, alt = "", eager = false }: { src: string | null; companyLogo?: string | null; companyName?: string | null; companySlug?: string | null; host?: string | null; alt?: string; eager?: boolean }) {
  const article = isRemoteUrl(src) ? imageSrc(src, 192) : null; // the brand matrix stores notes like "inline SVG in header" in some url columns
  const logo = imageSrc(resolveLogo({ slug: companySlug, name: companyName, logoUrl: companyLogo }), 192);
  const favicon = host ? imageSrc(`https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${encodeURIComponent(host)}&size=128`) : null;
  const chain = [article, logo, favicon].filter((u): u is string => !!u);
  const logoIdx = logo ? chain.indexOf(logo) : -1;
  const favIdx = favicon ? chain.indexOf(favicon) : -1;
  const [i, setI] = useState(0);
  useEffect(() => { setI(0); }, [article, logo, favicon]);
  const cur = chain[i];
  const loading = eager ? "eager" : "lazy";
  const fetchPriority = eager ? "auto" : "low";
  if (!cur) {
    if (companyName) return <LogoMonogram name={companyName} size={96} className={`${BOX} text-3xl`} />;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img data-testid="news-image-placeholder" src={FALLBACK_NEWS_TILE} alt="" width={96} height={96} loading={loading} decoding="async" fetchPriority={fetchPriority} aria-hidden
        data-thumb-kind="placeholder" className={`${BOX} bg-[#f3f4f6] object-contain p-2`} />
    );
  }
  const kind = i === favIdx ? "favicon" : i === logoIdx ? "company-logo" : "article";
  const onLoad = (e: SyntheticEvent<HTMLImageElement>) => { if (e.currentTarget.naturalWidth === 0) setI((n) => n + 1); };
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img data-testid="news-image" src={cur} alt={alt} width={96} height={96} loading={loading} decoding="async" fetchPriority={fetchPriority} referrerPolicy="no-referrer"
      data-thumb-kind={kind}
      className={`${BOX} bg-white ${kind === "favicon" ? "object-contain p-6" : kind === "company-logo" ? "object-contain p-3" : "object-cover"}`}
      onError={() => setI((n) => n + 1)} onLoad={onLoad} />
  );
}
