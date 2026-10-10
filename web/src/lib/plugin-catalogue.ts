import catalogue from "@/data/plugin-catalogue.json";

export type PluginMeta = {
  id: string;
  name: string;
  domain: string;
  category: string;
  pinned: boolean;
  defaultOn: boolean;
  description: string;
  logoUrl?: string;
};

/** Perplexity — pinned, always on, always first in `pluginIds`. */
export const PINNED_PLUGIN_ID = "plugin-1722260873";

export const PLUGIN_CATALOGUE: PluginMeta[] = (catalogue.plugins as PluginMeta[]).map((p) => ({ ...p }));

export const pluginMeta = (id: string): PluginMeta | undefined => PLUGIN_CATALOGUE.find((p) => p.id === id);

export const pluginName = (id: string): string => pluginMeta(id)?.name ?? id;

const isHttp = (u: string | undefined): u is string => !!u && /^https?:\/\//i.test(u);

/** Ordered favicon URL candidates: logoUrl (if http(s)) → Google s2 favicon. The monogram is the final React fallback, not a URL. */
export const faviconChain = (p: PluginMeta): string[] => {
  const chain: string[] = [];
  if (isHttp(p.logoUrl)) chain.push(p.logoUrl);
  chain.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(p.domain)}&sz=64`);
  return chain;
};
