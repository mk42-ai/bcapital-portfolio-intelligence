"use client";
import { useEffect, useState, type SyntheticEvent } from "react";
import { LogoMonogram } from "@/components/ui/logo-img";
import { resolveLogo } from "@/lib/local-logos";
import { FALLBACK_LOGO_TILE, imageSrc } from "@/lib/img-proxy";

/**
 * Shared company logo: plain lazy <img> in a bordered white square; falls back to a serif-initial monogram tile on
 * error / missing src / zero-width decode. Prefers a locally hosted mark from LOCAL_LOGOS (e.g. perplexity-ai) when the
 * slug or name matches — local /brand/… assets are served direct, a remote backend `logo_url` goes through the same-origin
 * /api/img proxy (hotlink 403s / mixed content never reach the browser). Testids `company-logo` / `company-logo-fallback`
 * are kept for the e2e suite; the fallback also carries the `logo-monogram` class. Only when no name is available at all
 * does the neutral logo-tile.webp render. Every state is the same `size`×`size` bordered box → no layout shift on swap.
 */
export function CompanyLogo({ name, src, slug, size = 20, className = "", eager = false }: { name: string; src?: string | null; slug?: string | null; size?: number; className?: string; eager?: boolean }) {
  const resolved = imageSrc(resolveLogo({ slug, name, logoUrl: src }), Math.max(64, size * 3));
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [resolved]);
  const box = { width: size, height: size } as const;
  const loading = eager ? "eager" : "lazy";
  const fetchPriority = eager ? "auto" : "low";
  if (!resolved || failed) {
    if (name && name.trim()) return <LogoMonogram name={name} size={size} testId="company-logo-fallback" className={className} style={{ fontSize: Math.max(8, Math.round(size * 0.46)) }} />;
    return (
      <span style={box} className={`inline-grid shrink-0 place-items-center overflow-hidden rounded border border-border bg-white ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img data-testid="company-logo-fallback" src={FALLBACK_LOGO_TILE} alt="" width={size} height={size} loading={loading} decoding="async" fetchPriority={fetchPriority} aria-hidden style={{ width: size - 2, height: size - 2 }} className="object-cover" />
      </span>
    );
  }
  const onLoad = (e: SyntheticEvent<HTMLImageElement>) => { if (e.currentTarget.naturalWidth === 0) setFailed(true); };
  return (
    <span style={box} className={`inline-grid shrink-0 place-items-center overflow-hidden rounded border border-border bg-white ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img data-testid="company-logo" src={resolved} alt="" title={name} width={size} height={size} loading={loading} decoding="async" fetchPriority={fetchPriority} referrerPolicy="no-referrer" onError={() => setFailed(true)} onLoad={onLoad} style={{ width: size - 2, height: size - 2 }} className="object-contain" />
    </span>
  );
}
