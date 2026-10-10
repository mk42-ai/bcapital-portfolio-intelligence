import { NextResponse } from "next/server";
import { ONDEMAND_BASE_URL, UPSTREAM_USER_AGENT, serverApiKey } from "@/lib/ondemand/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAGES = [1, 2, 3] as const;
const PAGE_LIMIT = 100;
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
};

export type ApiPlugin = {
  id: string;
  name: string;
  identifier: string;
  category: string;
  logoUrl?: string;
  isSubscribed: boolean;
  description: string;
};

export type ApiPluginsResponse = { fetchedAt: string; total: number; plugins: ApiPlugin[]; error?: string };

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

async function fetchPage(page: number, apikey: string): Promise<UpstreamPlugin[]> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const r = await fetch(`${ONDEMAND_BASE_URL}/plugin/v1/search?limit=${PAGE_LIMIT}&page=${page}`, {
      headers: { apikey, "user-agent": UPSTREAM_USER_AGENT, accept: "application/json" },
      cache: "no-store",
      signal: ctl.signal,
    });
    if (!r.ok) throw new Error(`upstream HTTP ${r.status} on page ${page}`);
    return extractList(await r.json());
  } finally {
    clearTimeout(t);
  }
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

  try {
    const pages = await Promise.all(PAGES.map((p) => fetchPage(p, apikey)));
    const seen = new Set<string>();
    const plugins: ApiPlugin[] = [];
    for (const raw of pages.flat()) {
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
      });
    }
    return respond({ fetchedAt, total: plugins.length, plugins });
  } catch (e) {
    const msg = e instanceof Error ? (e.name === "AbortError" ? "upstream timeout" : e.message) : "upstream failure";
    return respond({ fetchedAt, total: 0, plugins: [], error: scrub(msg, apikey) });
  }
}
