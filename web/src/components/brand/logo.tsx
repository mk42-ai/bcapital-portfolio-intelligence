import Image from "next/image";

/**
 * Official B Capital logo (green mark + dark-navy "B Capital" wordmark).
 * Asset: /public/brand/b-capital-logo.svg — downloaded unaltered from
 * https://b.capital/wp-content/uploads/2023/08/logo-1.svg (the site's own header logo).
 * Intrinsic size 211×43 (see web/docs/BRAND_ASSETS.md for provenance).
 */
export const BRAND_LOGO_SRC = "/brand/b-capital-logo.svg";
export const BRAND_LOGO_INTRINSIC = { width: 211, height: 43 } as const;

export function BrandLogo({ height = 28, className }: { height?: number; className?: string }) {
  const width = Math.round((height * BRAND_LOGO_INTRINSIC.width) / BRAND_LOGO_INTRINSIC.height);
  return (
    <Image
      src={BRAND_LOGO_SRC}
      alt="B Capital"
      width={width}
      height={height}
      unoptimized
      priority
      decoding="async"
      data-testid="brand-logo"
      className={className}
      style={{ width, height }}
    />
  );
}
