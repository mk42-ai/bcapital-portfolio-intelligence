/**
 * Locally hosted brand marks that take precedence over the backend `logo_url`.
 * Keyed by company slug. Assets live in /public/brand/logos and are downloaded unaltered from the
 * company's own site (provenance is recorded in a comment at the top of each SVG) — never AI-generated.
 */
export const LOCAL_LOGOS: Record<string, string> = {
  "perplexity-ai": "/brand/logos/perplexity.svg",
};

const slugify = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * Resolve the logo to render: a local asset when the slug (or a slugified name, e.g. "Perplexity AI") is in LOCAL_LOGOS,
 * otherwise the remote `logo_url` when it is a real http(s) URL (the brand matrix sometimes stores notes like
 * "inline SVG in header" in that column), otherwise null → caller renders the monogram tile.
 */
export function resolveLogo({ slug, name, logoUrl }: { slug?: string | null; name?: string | null; logoUrl?: string | null }): string | null {
  if (slug && LOCAL_LOGOS[slug]) return LOCAL_LOGOS[slug];
  if (name) { const k = slugify(name); if (LOCAL_LOGOS[k]) return LOCAL_LOGOS[k]; }
  return logoUrl && /^https?:\/\//i.test(logoUrl) ? logoUrl : null;
}
