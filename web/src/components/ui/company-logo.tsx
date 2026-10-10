"use client";
import { useState } from "react";

/** Shared company logo: plain lazy <img> in a bordered white square; falls back to neutral initials on error / missing src. */
export function CompanyLogo({ name, src, size = 20, className = "" }: { name: string; src?: string | null; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
  const box = { width: size, height: size } as const;
  if (!src || failed) {
    return (
      <span data-testid="company-logo-fallback" title={name} aria-hidden style={{ ...box, fontSize: Math.max(8, Math.round(size * 0.42)) }} className={`inline-grid shrink-0 select-none place-items-center rounded border border-border bg-white font-semibold leading-none text-gray-500 ${className}`}>
        {initials}
      </span>
    );
  }
  return (
    <span style={box} className={`inline-grid shrink-0 place-items-center overflow-hidden rounded border border-border bg-white ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img data-testid="company-logo" src={src} alt="" title={name} width={size} height={size} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} style={{ width: size - 2, height: size - 2 }} className="object-contain" />
    </span>
  );
}
