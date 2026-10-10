"use client";
import { useEffect, useState, type SyntheticEvent } from "react";
import { LogoMonogram } from "@/components/ui/logo-img";
import { resolveLogo } from "@/lib/local-logos";

/**
 * Shared company logo: plain lazy <img> in a bordered white square; falls back to a serif-initial monogram tile on
 * error / missing src / zero-width decode. Prefers a locally hosted mark from LOCAL_LOGOS (e.g. perplexity-ai) when the
 * slug or name matches. Testids `company-logo` / `company-logo-fallback` are kept for the e2e suite; the fallback also
 * carries the `logo-monogram` class.
 */
export function CompanyLogo({ name, src, slug, size = 20, className = "" }: { name: string; src?: string | null; slug?: string | null; size?: number; className?: string }) {
  const resolved = resolveLogo({ slug, name, logoUrl: src });
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [resolved]);
  const box = { width: size, height: size } as const;
  if (!resolved || failed) return <LogoMonogram name={name} size={size} testId="company-logo-fallback" className={className} style={{ fontSize: Math.max(8, Math.round(size * 0.46)) }} />;
  const onLoad = (e: SyntheticEvent<HTMLImageElement>) => { if (e.currentTarget.naturalWidth === 0) setFailed(true); };
  return (
    <span style={box} className={`inline-grid shrink-0 place-items-center overflow-hidden rounded border border-border bg-white ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img data-testid="company-logo" src={resolved} alt="" title={name} width={size} height={size} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} onLoad={onLoad} style={{ width: size - 2, height: size - 2 }} className="object-contain" />
    </span>
  );
}
