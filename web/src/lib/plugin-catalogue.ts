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
  /** True when the marketplace entry declares credential fields (pluginConfiguration.fields non-empty). Values are never forwarded. */
  needsCredentials?: boolean;
  /** True when this account already holds an active configuration for those fields (so it is usable without a prompt). */
  credentialsConfigured?: boolean;
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
/** FULL live directory (every chat plugin `/api/plugins` returned, all 182) as PluginMeta — the search box filters this, not the 40-row merge. */
let LIVE_DIRECTORY: PluginMeta[] | null = null;
const LIVE_FLAGS = new Map<string, { needsCredentials: boolean; credentialsConfigured: boolean; isSubscribed: boolean }>();

export const pluginMeta = (id: string): PluginMeta | undefined =>
  LIVE_MERGED?.find((p) => p.id === id) ?? PLUGIN_CATALOGUE.find((p) => p.id === id) ?? LIVE_DIRECTORY?.find((p) => p.id === id);

/** Every live chat plugin (182 when `/api/plugins` paginated fully), curated-overlaid, pinned first then alphabetical. Empty until `mergeLivePlugins` ran. */
export const fullPluginDirectory = (): PluginMeta[] => LIVE_DIRECTORY ?? [];

/** Case-insensitive search over the FULL directory (name, id, identifier, category, description). Pinned row always first when it matches. */
export function searchPluginDirectory(query: string, limit = MERGED_LIST_CAP): { matches: PluginMeta[]; total: number } {
  const q = query.trim().toLowerCase();
  const dir = LIVE_DIRECTORY ?? currentPluginList();
  if (!q) return { matches: dir.slice(0, limit), total: dir.length };
  const hit = (p: PluginMeta) => p.name.toLowerCase().includes(q) || p.id.includes(q) || (p.identifier ?? "").toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
  const all = dir.filter(hit);
  const pinnedFirst = [...all.filter((p) => p.id === PINNED_PLUGIN_ID), ...all.filter((p) => p.id !== PINNED_PLUGIN_ID)];
  return { matches: pinnedFirst.slice(0, limit), total: all.length };
}

/* ------------------------------------------------------------------------------------------------------------------------------------------
 * Honest plugin states. Precedence (first match wins): blocked > invoked > selected > installed > authorized > connected > suggested.
 *   blocked    — the last bridge run recorded a credits/upstream error for this id (detectPluginError in /api/chat → markPluginBlocked).
 *   invoked    — the current/last run opened a tool card for it (toolStart in /api/chat → markPluginInvoked).
 *   selected   — in the per-turn selection (sessionStorage, `usePluginSelection`).
 *   installed  — appears in GET /plugin/v1/list (account-OWNED plugin). Currently NO plugin on this account (list total 0, see proof/team-a/plugin-inventory.json).
 *   authorized — a credential was posted via /api/chat/creds this session (markPluginAuthorized — no caller yet: creds/route.ts is outside Agent 11's scope).
 *   connected  — the catalogue says it needs no credentials (or the account already holds an active configuration for them).
 *   suggested  — otherwise (listed by the marketplace search; nothing proves it is usable).
 * The block/invoke maps are tiny in-memory maps kept on `globalThis` so the /api/chat and /api/plugins route bundles share ONE instance per server
 * process; they reset on restart, and /api/plugins re-seeds `blocked` from the newest audit entry that recorded a plugin error (last 24 h).
 * ---------------------------------------------------------------------------------------------------------------------------------------- */
export type PluginState = "suggested" | "installed" | "connected" | "authorized" | "selected" | "invoked" | "blocked";
export const PLUGIN_STATE_ORDER: readonly PluginState[] = ["blocked", "invoked", "selected", "installed", "authorized", "connected", "suggested"];
export type PluginStateCtx = {
  selected?: readonly string[];
  owned?: readonly string[];
  invoked?: readonly string[];
  authorized?: readonly string[];
  blocked?: Readonly<Record<string, string>>;
};
type StateStore = { blocked: Map<string, { reason: string; at: number }>; invoked: Map<string, number>; authorized: Map<string, number>; owned: Set<string> };
const STORE_KEY = "__bcap_plugin_state_store__";
const store = (): StateStore => {
  const g = globalThis as unknown as Record<string, StateStore | undefined>;
  if (!g[STORE_KEY]) g[STORE_KEY] = { blocked: new Map(), invoked: new Map(), authorized: new Map(), owned: new Set() };
  return g[STORE_KEY]!;
};
export const markPluginBlocked = (id: string, reason: string): void => { if (id) store().blocked.set(id, { reason: reason.slice(0, 400), at: Date.now() }); };
export const clearPluginBlocked = (id: string): void => { store().blocked.delete(id); };
export const pluginBlockReason = (id: string): string | undefined => store().blocked.get(id)?.reason;
export const markPluginInvoked = (id: string): void => { if (id) store().invoked.set(id, Date.now()); };
export const markPluginAuthorized = (id: string): void => { if (id) store().authorized.set(id, Date.now()); };
export const setOwnedPluginIds = (ids: readonly string[]): void => { const s = store(); s.owned.clear(); for (const id of ids) s.owned.add(id); };
/** Snapshot of the in-memory state maps (what `/api/plugins` returns under `states` and what the panel polls). */
export const pluginStateSnapshot = (): { blocked: Record<string, string>; invoked: string[]; authorized: string[]; owned: string[] } => {
  const s = store();
  return { blocked: Object.fromEntries([...s.blocked].map(([k, v]) => [k, v.reason])), invoked: [...s.invoked.keys()], authorized: [...s.authorized.keys()], owned: [...s.owned] };
};
/** Replace the local maps with a server snapshot (client side, after polling `/api/plugins?states=1`). */
export const applyPluginStateSnapshot = (snap: Partial<ReturnType<typeof pluginStateSnapshot>>): void => {
  const s = store();
  if (snap.blocked) { s.blocked.clear(); for (const [k, v] of Object.entries(snap.blocked)) s.blocked.set(k, { reason: String(v), at: Date.now() }); }
  if (snap.invoked) { s.invoked.clear(); for (const id of snap.invoked) s.invoked.set(id, Date.now()); }
  if (snap.authorized) for (const id of snap.authorized) s.authorized.set(id, Date.now());
  if (snap.owned) setOwnedPluginIds(snap.owned);
};
/** Does the live directory say this plugin needs no credentials (or already has them configured)? Unknown → false (stays `suggested`). */
export const pluginIsConnected = (id: string): boolean => { const f = LIVE_FLAGS.get(id); return !!f && (!f.needsCredentials || f.credentialsConfigured); };

export function pluginState(p: Pick<PluginMeta, "id"> | string, ctx: PluginStateCtx = {}): PluginState {
  const id = typeof p === "string" ? p : p.id;
  const s = store();
  if ((ctx.blocked && id in ctx.blocked) || s.blocked.has(id)) return "blocked";
  if (ctx.invoked?.includes(id) || s.invoked.has(id)) return "invoked";
  if (ctx.selected?.includes(id)) return "selected";
  if (ctx.owned?.includes(id) || s.owned.has(id)) return "installed";
  if (ctx.authorized?.includes(id) || s.authorized.has(id)) return "authorized";
  if (pluginIsConnected(id)) return "connected";
  return "suggested";
}
/** Reason text for the badge title: block reason when blocked, otherwise a one-line definition of the state. */
export function pluginStateTitle(id: string, state: PluginState): string {
  if (state === "blocked") return pluginBlockReason(id) ?? "Upstream error recorded on the last run";
  return {
    invoked: "A tool card was opened for this plugin in the current/last run",
    selected: "In this turn's pluginIds",
    installed: "Owned by this account (GET /plugin/v1/list)",
    authorized: "A credential was posted via /api/chat/creds this session",
    connected: "Marketplace entry needs no credentials (or they are already configured)",
    suggested: "Listed by the marketplace search; not yet proven usable",
    blocked: "",
  }[state];
}

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
  // Full directory: every live chat plugin, curated-overlaid where known, pinned first then alphabetical. Also records the credential flags.
  LIVE_FLAGS.clear();
  const mergedById = new Map(merged.map((p) => [p.id, p]));
  const rest: PluginMeta[] = [];
  for (const l of live) {
    LIVE_FLAGS.set(l.id, { needsCredentials: l.needsCredentials === true, credentialsConfigured: l.credentialsConfigured === true, isSubscribed: l.isSubscribed === true });
    if (mergedById.has(l.id)) continue;
    const dir = DIRECTORY.get(l.id); const name = l.name?.trim() || dir?.name || l.id;
    rest.push({ id: l.id, name, domain: domainForName(name), category: l.category ?? dir?.category ?? "general", pinned: false, defaultOn: false, description: l.description ?? dir?.description ?? "", logoUrl: isHttp(l.logoUrl) ? l.logoUrl : undefined, identifier: l.identifier ?? dir?.identifier });
  }
  rest.sort(byName);
  LIVE_DIRECTORY = [...merged, ...rest];
  return merged;
}
