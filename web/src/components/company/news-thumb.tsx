"use client";
import { useEffect, useState, type SyntheticEvent } from "react";
import { Newspaper } from "lucide-react";
import { LogoMonogram } from "@/components/ui/logo-img";
import { resolveLogo } from "@/lib/local-logos";
/**
 * News thumbnail with a REAL-image fallback chain (never an AI/placeholder graphic): the article's own image → the company's
 * official logo (local LOCAL_LOGOS asset or backend `logo_url`) → the publisher's favicon (Google S2 service, 128 px) → a
 * serif-initial monogram tile when the company name is known → a neutral Lucide glyph as the very last resort.
 * Each step only advances on a decode error (or a zero-width "successful" load), so a card shows a genuine, decodable image whenever one exists.
 */
export function NewsThumb({ src, companyLogo, companyName, companySlug, host, alt = "", eager = false }: { src: string | null; companyLogo?: string | null; companyName?: string | null; companySlug?: string | null; host?: string | null; alt?: string; eager?: boolean }) {
  const okUrl = (u: string | null | undefined) => (u && /^https?:\/\//i.test(u) ? u : null); // the brand matrix stores notes like "inline SVG in header" in logo_url
  const logo = resolveLogo({ slug: companySlug, name: companyName, logoUrl: companyLogo });
  const chain = [okUrl(src), logo, host ? `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${encodeURIComponent(host)}&size=128` : null].filter((u): u is string => !!u);
  const logoIdx = logo ? chain.indexOf(logo) : -1;
  const [i, setI] = useState(0);
  useEffect(() => { setI(0); }, [src, logo, host]);
  const cur = chain[i];
  if (!cur) {
    if (companyName) return <LogoMonogram name={companyName} size={96} className="rounded-lg text-3xl" />;
    return <div data-testid="news-image-placeholder" className="grid size-24 shrink-0 place-items-center rounded-lg border border-border bg-surface-2 text-muted" aria-hidden><Newspaper className="size-6" strokeWidth={1.75} /></div>;
  }
  const isFavicon = i === chain.length - 1 && !!host && cur.includes("faviconV2");
  const onLoad = (e: SyntheticEvent<HTMLImageElement>) => { if (e.currentTarget.naturalWidth === 0) setI((n) => n + 1); };
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img data-testid="news-image" src={cur} alt={alt} width={96} height={96} loading={eager ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer"
      data-thumb-kind={isFavicon ? "favicon" : i === logoIdx ? "company-logo" : "article"}
      className={`size-24 shrink-0 rounded-lg border border-border bg-white ${isFavicon ? "object-contain p-6" : i === logoIdx ? "object-contain p-3" : "object-cover"}`}
      onError={() => setI((n) => n + 1)} onLoad={onLoad} />
  );
}
