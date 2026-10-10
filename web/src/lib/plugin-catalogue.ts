import catalogue from "@/data/plugin-catalogue.json";
import directory from "@/data/plugin-directory.json";

export type PluginMeta = {
  id: string;
  name: string;
  domain: string;
  category: string;
  pinned: boolean;
  defaultOn: boolean;
  description: string;
  /** Live, SAS-signed CDN URL from `/api/plugins` (expires within days — never persisted). */
  logoUrl?: string;
  /** Unsigned CDN path from the curated catalogue (answers 409 without a signature, kept as a chain hop). */
  logoUrlBase?: string;
  identifier?: string;
};

/** Shape returned by `GET /api/plugins` (one entry per live chat plugin). */
export type LivePlugin = {
  id: string;
  name: string;
  logoUrl?: string;
  category?: string;
  identifier?: string;
  description?: string;
  isSubscribed?: boolean;
};

/** Perplexity — pinned, always on, always first in `pluginIds`. */
export const PINNED_PLUGIN_ID = "plugin-1722260873";

/** Plugin ids visible in the reference screenshot — always eligible for the merged list when subscribed. */
export const REFERENCE_PLUGIN_IDS: readonly string[] = [
  "plugin-1722260873", "plugin-1713924030", "plugin-1741871229", "plugin-1751872652", "plugin-1785777296",
  "plugin-1716372717", "plugin-1716164040", "plugin-1785987361", "plugin-1784356219", "plugin-1748003575", "plugin-1718116202",
];

const ELIGIBLE_CATEGORIES = new Set(["research_and_insights", "general", "finance", "marketing", "data_and_analytics"]);
export const MERGED_LIST_CAP = 40;

export const PLUGIN_CATALOGUE: PluginMeta[] = (catalogue.plugins as PluginMeta[]).map((p) => ({ ...p }));

type DirectoryEntry = { id: string; name: string; identifier?: string; category?: string; isSubscribed?: boolean; description?: string };
const DIRECTORY: ReadonlyMap<string, DirectoryEntry> = new Map(((directory as { plugins: DirectoryEntry[] }).plugins ?? []).map((p) => [p.id, p]));

/** Last merged list (set by `mergeLivePlugins`) so `pluginMeta(id)` resolves live plugins + live logos anywhere in the tree. */
let LIVE_MERGED: PluginMeta[] | null = null;

export const pluginMeta = (id: string): PluginMeta | undefined =>
  LIVE_MERGED?.find((p) => p.id === id) ?? PLUGIN_CATALOGUE.find((p) => p.id === id);

export const pluginName = (id: string): string => pluginMeta(id)?.name ?? id;

/** Current merged list: live-merged when `/api/plugins` has answered, otherwise the curated 14. */
export const currentPluginList = (): PluginMeta[] => LIVE_MERGED ?? PLUGIN_CATALOGUE;

const isHttp = (u: string | undefined): u is string => !!u && /^https?:\/\//i.test(u);

export const s2FaviconUrl = (domain: string) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;

/** Ordered favicon URL candidates: live logoUrl → logoUrlBase → Google s2 by domain. The monogram is the final React fallback, not a URL. */
export const faviconChain = (p: PluginMeta): string[] => {
  const chain: string[] = [];
  if (isHttp(p.logoUrl)) chain.push(p.logoUrl);
  if (isHttp(p.logoUrlBase) && p.logoUrlBase !== p.logoUrl) chain.push(p.logoUrlBase);
  chain.push(s2FaviconUrl(p.domain));
  return chain;
};

const DOMAIN_RULES: [RegExp, string][] = [
  [/twitter|\bx\b|x search/i, "x.com"],
  [/youtube/i, "youtube.com"],
  [/linkedin/i, "linkedin.com"],
  [/instagram/i, "instagram.com"],
  [/tiktok/i, "tiktok.com"],
  [/reddit/i, "reddit.com"],
  [/stock|mutual/i, "sec.gov"],
  [/crypto|solana|dex/i, "coingecko.com"],
  [/weather/i, "weather.gov"],
];

/** Derive a favicon domain for a plugin by name keyword (fallback on-demand.io). */
export const domainForName = (name: string): string => DOMAIN_RULES.find(([re]) => re.test(name))?.[1] ?? "on-demand.io";

const byName = (a: PluginMeta, b: PluginMeta) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });

/**
 * Overlay live `logoUrl`/name onto the curated 14 (by id), then append additional live plugins that are
 * subscribed AND (in REFERENCE_PLUGIN_IDS OR in the static directory with an eligible category).
 * Curated first (catalogue order), appended ones alphabetical, capped at MERGED_LIST_CAP.
 */
export function mergeLivePlugins(live: LivePlugin[]): PluginMeta[] {
  const liveById = new Map(live.map((p) => [p.id, p]));
  const curated: PluginMeta[] = PLUGIN_CATALOGUE.map((p) => {
    const l = liveById.get(p.id);
    if (!l) return { ...p };
    return { ...p, name: l.name?.trim() || p.name, logoUrl: isHttp(l.logoUrl) ? l.logoUrl : undefined, identifier: l.identifier ?? p.identifier };
  });
  const seen = new Set(curated.map((p) => p.id));
  const extra: PluginMeta[] = [];
  for (const l of live) {
    if (seen.has(l.id) || !l.isSubscribed) continue;
    const dir = DIRECTORY.get(l.id);
    const category = l.category ?? dir?.category ?? "general";
    const eligible = REFERENCE_PLUGIN_IDS.includes(l.id) || (!!dir && ELIGIBLE_CATEGORIES.has(dir.category ?? ""));
    if (!eligible) continue;
    seen.add(l.id);
    extra.push({
      id: l.id,
      name: l.name?.trim() || dir?.name || l.id,
      domain: domainForName(l.name || dir?.name || ""),
      category,
      pinned: false,
      defaultOn: false,
      description: l.description ?? dir?.description ?? "",
      logoUrl: isHttp(l.logoUrl) ? l.logoUrl : undefined,
      identifier: l.identifier ?? dir?.identifier,
    });
  }
  extra.sort(byName);
  const merged = [...curated, ...extra].slice(0, MERGED_LIST_CAP);
  LIVE_MERGED = merged;
  return merged;
}
