"use client";
import { useEffect, useState, type SyntheticEvent } from "react";
import { LogoMonogram, hasMonogram } from "@/components/ui/logo-img";
import { ASSET } from "@/lib/assets";
import { resolveLogo } from "@/lib/local-logos";
import { imageSrc } from "@/lib/img-proxy";

/**
 * Shared company logo: plain lazy <img> in a bordered white square; falls back to a serif-initial monogram tile on
 * error / missing src / zero-width decode. Prefers a locally hosted mark from LOCAL_LOGOS (e.g. perplexity-ai) when the
 * slug or name matches — local /brand/… assets are served direct, a remote backend `logo_url` goes through the same-origin
 * /api/img proxy (hotlink 403s / mixed content never reach the browser). Testids `company-logo` / `company-logo-fallback`
 * are kept for the e2e suite; the monogram fallback also carries the `logo-monogram` class. Only when no name is available
 * (or the monogram would be empty / non-alphanumeric) does the local company-logo asset (ASSET.companyLogo, transparent)
 * render inside the same white bordered square. Every state is the same `size`×`size` box → no layout shift on swap.
 */
export function CompanyLogo({ name, src, slug, size = 20, className = "", eager = false }: { name: string; src?: string | null; slug?: string | null; size?: number; className?: string; eager?: boolean }) {
  const resolved = imageSrc(resolveLogo({ slug, name, logoUrl: src }), Math.max(64, size * 3));
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [resolved]);
  const box = { width: size, height: size } as const;
  const inner = { width: Math.max(1, size - 4), height: Math.max(1, size - 4) } as const; // 2 px inset on every side
  const loading = eager ? "eager" : "lazy";
  const fetchPriority = eager ? "auto" : "low";
  const frame = `inline-grid shrink-0 place-items-center overflow-hidden rounded border border-border bg-white ${className}`;
  if (!resolved || failed) {
    if (hasMonogram(name)) return <LogoMonogram name={name} size={size} testId="company-logo-fallback" className={className} style={{ fontSize: Math.max(8, Math.round(size * 0.46)) }} />;
    return (
      <span style={box} className={frame} title={name || undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img data-testid="company-logo-fallback" src={ASSET.companyLogo} alt="" width={inner.width} height={inner.height} loading={loading} decoding="async" fetchPriority={fetchPriority} aria-hidden style={inner} className="object-contain" />
      </span>
    );
  }
  const onLoad = (e: SyntheticEvent<HTMLImageElement>) => { if (e.currentTarget.naturalWidth === 0) setFailed(true); };
  return (
    <span style={box} className={frame}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img data-testid="company-logo" src={resolved} alt="" title={name} width={size} height={size} loading={loading} decoding="async" fetchPriority={fetchPriority} referrerPolicy="no-referrer" onError={() => setFailed(true)} onLoad={onLoad} style={{ width: size - 2, height: size - 2 }} className="object-contain" />
    </span>
  );
}
