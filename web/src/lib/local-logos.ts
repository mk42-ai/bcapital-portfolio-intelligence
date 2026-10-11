/**
 * Locally hosted brand marks that take precedence over the backend `logo_url`.
 * Keyed by company slug. Assets live in /public/brand/logos and are downloaded unaltered from the
 * company's own site (provenance is recorded in a comment at the top of each SVG) — never AI-generated.
 */
import logoManifest from "../../public/logos/manifest.json";

export const LOCAL_LOGOS: Record<string, string> = {
  "perplexity-ai": "/brand/logos/perplexity.svg",
};

type ManifestEntry = { file: string; source: string | null; bytes: number; status: "ok" | "OPEN" };
const MANIFEST_LOGOS: Record<string, ManifestEntry> = (logoManifest as { logos: Record<string, ManifestEntry> }).logos ?? {};

/**
 * `/logos/<slug>.<ext>` fetched by `web/scripts/fetch-logos.mjs` from the company's official domain (≤ 8 KB, sanitised SVG or
 * optimised PNG) when present in `public/logos/manifest.json`, otherwise null. Monogram fallbacks (status "OPEN") are also served —
 * they are deterministic sector-tinted SVGs, not AI-generated art.
 */
export function localLogoFor(slug?: string | null): string | null {
  if (!slug) return null;
  const entry = MANIFEST_LOGOS[slug];
  return entry?.file ? entry.file : null;
}

const slugify = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * Resolve the logo to render: a local asset when the slug (or a slugified name, e.g. "Perplexity AI") is in LOCAL_LOGOS or in
 * public/logos/manifest.json (official-domain fetch, see localLogoFor),
 * otherwise the remote `logo_url` when it is a real http(s) URL (the brand matrix sometimes stores notes like
 * "inline SVG in header" in that column), otherwise null → caller renders the monogram tile.
 */
export function resolveLogo({ slug, name, logoUrl }: { slug?: string | null; name?: string | null; logoUrl?: string | null }): string | null {
  if (slug && LOCAL_LOGOS[slug]) return LOCAL_LOGOS[slug];
  const fetched = localLogoFor(slug) ?? (name ? localLogoFor(slugify(name)) : null);
  if (fetched) return fetched;
  if (name) { const k = slugify(name); if (LOCAL_LOGOS[k]) return LOCAL_LOGOS[k]; }
  return logoUrl && /^https?:\/\//i.test(logoUrl) ? logoUrl : null;
}
