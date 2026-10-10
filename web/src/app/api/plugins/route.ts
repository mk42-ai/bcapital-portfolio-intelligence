import { NextResponse } from "next/server";
import { ONDEMAND_BASE_URL, UPSTREAM_USER_AGENT, serverApiKey } from "@/lib/ondemand/config";
import { markPluginBlocked, pluginStateSnapshot, setOwnedPluginIds } from "@/lib/plugin-catalogue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Pagination (measured 2026-10-10, proof/team-a/plugin-inventory.json): `limit=100` is clamped upstream — page 1 returns 99, page 2 returns 91,
 * page 3 returns 0, with `isComplete:false` on every page and `total:191` declared (182 chat + 8 file). So the route LOOPS pages until a page comes
 * back empty (or `isComplete:true`), capped at MAX_PAGES, and dedupes by id — a fixed 1..3 fan-out would silently stop at whatever the clamp allows.
 * `GET /plugin/v1/list` (account-OWNED plugins) is fetched alongside: it answers total 0 for this account, which is the honest `installed` set.
 */
const PAGE_LIMIT = 100;
const MAX_PAGES = 10;
const UPSTREAM_TIMEOUT_MS = 15_000;

type UpstreamPlugin = {
  pluginId?: string;
  id?: string;
  name?: string;
  identifier?: string;
  category?: string;
  type?: string;
  logoUrl?: string;
  isSubscribed?: boolean;
  description?: string;
  pluginConfiguration?: { active?: boolean; fields?: Record<string, unknown> | unknown[] | null } | null;
};

export type ApiPlugin = {
  id: string;
  name: string;
  identifier: string;
  category: string;
  logoUrl?: string;
  isSubscribed: boolean;
  description: string;
  /** Marketplace entry declares credential fields (keys only are inspected; values are never forwarded to the browser). */
  needsCredentials: boolean;
  /** This account already holds an active configuration for those fields. */
  credentialsConfigured: boolean;
};

export type ApiPluginStates = { blocked: Record<string, string>; invoked: string[]; authorized: string[]; owned: string[] };
export type ApiPluginsResponse = { fetchedAt: string; total: number; plugins: ApiPlugin[]; pages?: number; declaredTotal?: number | null; owned?: string[]; states?: ApiPluginStates; error?: string };

/** Never let an upstream message leak the key (defensive — the key is only ever sent as a header). */
const scrub = (msg: string, key: string) => (key ? msg.split(key).join("[redacted]") : msg).slice(0, 200);

function extractList(body: unknown): UpstreamPlugin[] {
  if (!body || typeof body !== "object") return [];
  const b = body as Record<string, unknown>;
  const data = (b.data ?? b) as Record<string, unknown> | unknown[];
  if (Array.isArray(data)) return data as UpstreamPlugin[];
  for (const k of ["plugins", "items", "results", "list"]) {
    const v = (data as Record<string, unknown>)[k];
    if (Array.isArray(v)) return v as UpstreamPlugin[];
  }
  return [];
}

async function fetchJson(path: string, apikey: string): Promise<unknown> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const r = await fetch(`${ONDEMAND_BASE_URL}${path}`, { headers: { apikey, "user-agent": UPSTREAM_USER_AGENT, accept: "application/json" }, cache: "no-store", signal: ctl.signal });
    if (!r.ok) throw new Error(`upstream HTTP ${r.status} on ${path.split("?")[0]}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}
const pageMeta = (body: unknown): { total: number | null; isComplete: boolean } => {
  const d = ((body as Record<string, unknown>)?.data ?? body) as Record<string, unknown> | undefined;
  return { total: typeof d?.total === "number" ? d.total : null, isComplete: d?.isComplete === true };
};
/** All search pages until an empty page / isComplete (see header comment). */
async function fetchAllSearchPages(apikey: string): Promise<{ items: UpstreamPlugin[]; pages: number; declaredTotal: number | null }> {
  const items: UpstreamPlugin[] = []; let declaredTotal: number | null = null; let pages = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = await fetchJson(`/plugin/v1/search?limit=${PAGE_LIMIT}&page=${page}`, apikey);
    const list = extractList(body); const meta = pageMeta(body); pages = page;
    declaredTotal = declaredTotal ?? meta.total;
    if (!list.length) break;
    items.push(...list);
    if (meta.isComplete) break;
    if (declaredTotal !== null && items.length >= declaredTotal) break;
  }
  return { items, pages, declaredTotal };
}
/** Account-owned plugins (`installed`). Failure → empty set, never a route error. */
async function fetchOwned(apikey: string): Promise<string[]> {
  try { return extractList(await fetchJson(`/plugin/v1/list?page=1&limit=${PAGE_LIMIT}`, apikey)).map((p) => String(p.pluginId ?? p.id ?? "").trim()).filter(Boolean); } catch { return []; }
}
const credentialFlags = (raw: UpstreamPlugin): { needsCredentials: boolean; credentialsConfigured: boolean } => {
  const cfg = raw.pluginConfiguration ?? null; const f = cfg?.fields;
  const n = Array.isArray(f) ? f.length : f && typeof f === "object" ? Object.keys(f).length : 0;
  return { needsCredentials: n > 0, credentialsConfigured: n > 0 && cfg?.active === true };
};
/**
 * Re-seed `blocked` from the newest payload-audit entry that recorded a plugin error (the in-memory map is per server process; the audit file
 * survives restarts). Only entries from the last 24 h count, and only when nothing newer recorded a clean run for that plugin.
 */
let seededAt = 0;
async function seedBlockedFromAudit(): Promise<void> {
  if (Date.now() - seededAt < 60_000) return; seededAt = Date.now();
  try {
    const [fs, path] = await Promise.all([import("node:fs/promises"), import("node:path")]);
    const arr = JSON.parse(await fs.readFile(path.join(process.cwd(), "proof", "chat-payload-audit.json"), "utf8")) as { at?: string; pluginIds?: string[]; timings?: { pluginError?: string | null } }[];
    if (!Array.isArray(arr)) return;
    const latest = new Map<string, { at: number; err: string | null }>();
    for (const e of arr) {
      const at = Date.parse(String(e.at ?? "")); if (!at || Date.now() - at > 86_400_000) continue;
      const err = e.timings?.pluginError ?? null; const m = err ? /\((plugin-\d+)\)/.exec(err) : null;
      const ids = m ? [m[1]] : (e.pluginIds ?? []);
      for (const id of ids) { const prev = latest.get(id); if (!prev || prev.at < at) latest.set(id, { at, err: m && m[1] === id ? err : null }); }
    }
    for (const [id, v] of latest) if (v.err) markPluginBlocked(id, v.err);
  } catch { /* no audit yet */ }
}

const respond = (body: ApiPluginsResponse) =>
  NextResponse.json(body, { status: 200, headers: { "Cache-Control": "private, max-age=600" } });

export async function GET(req: Request) {
  const fetchedAt = new Date().toISOString();
  const apikey = serverApiKey();
  if (!apikey) return respond({ fetchedAt, total: 0, plugins: [], error: "server missing ONDEMAND_API_KEY" });

  const url = new URL(req.url);
  const idsParam = url.searchParams.get("ids");
  const wanted = idsParam ? new Set(idsParam.split(",").map((s) => s.trim()).filter(Boolean)) : null;

  // Cheap poll: `?states=1` returns only the in-memory state snapshot (no upstream call) so the panel can refresh badges after a run.
  if (url.searchParams.get("states") === "1") { await seedBlockedFromAudit(); return respond({ fetchedAt, total: 0, plugins: [], states: pluginStateSnapshot() }); }

  try {
    const [{ items, pages: pageCount, declaredTotal }, owned] = await Promise.all([fetchAllSearchPages(apikey), fetchOwned(apikey), seedBlockedFromAudit()]);
    setOwnedPluginIds(owned);
    const seen = new Set<string>();
    const plugins: ApiPlugin[] = [];
    for (const raw of items) {
      const id = String(raw.pluginId ?? raw.id ?? "").trim();
      if (!id || seen.has(id)) continue;
      if ((raw.type ?? "chat") !== "chat") continue;
      if (wanted && !wanted.has(id)) continue;
      seen.add(id);
      plugins.push({
        id,
        name: String(raw.name ?? id),
        identifier: String(raw.identifier ?? ""),
        category: String(raw.category ?? "general"),
        logoUrl: typeof raw.logoUrl === "string" && /^https?:\/\//i.test(raw.logoUrl) ? raw.logoUrl : undefined,
        isSubscribed: raw.isSubscribed === true,
        description: String(raw.description ?? ""),
        ...credentialFlags(raw),
      });
    }
    return respond({ fetchedAt, total: plugins.length, plugins, pages: pageCount, declaredTotal, owned, states: pluginStateSnapshot() });
  } catch (e) {
    const msg = e instanceof Error ? (e.name === "AbortError" ? "upstream timeout" : e.message) : "upstream failure";
    return respond({ fetchedAt, total: 0, plugins: [], error: scrub(msg, apikey) });
  }
}
