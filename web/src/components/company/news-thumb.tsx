"use client";
import { useState } from "react";
import { Newspaper } from "lucide-react";
/**
 * News thumbnail with a REAL-image fallback chain (never an AI/placeholder graphic): the article's own image → the company's
 * official logo (backend `logo_url`) → the publisher's favicon (Google S2 service, 128 px) → a neutral Lucide glyph as the last
 * resort. Each step only advances on a decode error, so a card shows a genuine, decodable image whenever one exists.
 */
export function NewsThumb({ src, companyLogo, host, alt = "", eager = false }: { src: string | null; companyLogo?: string | null; host?: string | null; alt?: string; eager?: boolean }) {
  const okUrl = (u: string | null | undefined) => (u && /^https?:\/\//i.test(u) ? u : null); // the brand matrix stores notes like "inline SVG in header" in logo_url
  const chain = [okUrl(src), okUrl(companyLogo), host ? `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${encodeURIComponent(host)}&size=128` : null].filter((u): u is string => !!u);
  const logoIdx = okUrl(companyLogo) ? chain.indexOf(okUrl(companyLogo) as string) : -1;
  const [i, setI] = useState(0);
  const cur = chain[i];
  if (!cur) return <div data-testid="news-image-placeholder" className="grid size-24 shrink-0 place-items-center rounded-lg border border-border bg-surface-2 text-muted" aria-hidden><Newspaper className="size-6" strokeWidth={1.75} /></div>;
  const isFavicon = i === chain.length - 1 && !!host && cur.includes("faviconV2");
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img data-testid="news-image" src={cur} alt={alt} width={96} height={96} loading={eager ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer"
      data-thumb-kind={isFavicon ? "favicon" : i === logoIdx ? "company-logo" : "article"}
      className={`size-24 shrink-0 rounded-lg border border-border bg-white ${isFavicon ? "object-contain p-6" : i === logoIdx ? "object-contain p-3" : "object-cover"}`}
      onError={() => setI((n) => n + 1)} />
  );
}
