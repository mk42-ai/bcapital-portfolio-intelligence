import { NextRequest } from "next/server";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Same-origin image proxy for news thumbnails and remote company logos (same pattern as /api/favicon).
 *
 *   GET /api/img?u=<encoded https URL>[&w=<max width, accepted/reserved>][&probe=1]
 *
 * Why: publishers' CDNs answer hotlinked <img> requests with 403 (referer checks), mixed-content http URLs are blocked by the
 * browser outright, and ORB/CORP policies hide the real failure from the client. Fetching server-side with a browser UA and a
 * `referer` equal to the image's own origin defeats most of those, and a same-origin response is never blocked.
 *
 * Rules: https only (http → 400 "mixed content"), private/loopback/link-local hosts rejected, 6 s timeout, ≤3 redirects (each hop
 * re-validated), only `content-type: image/*` is forwarded (anything else → 204), 3 MB size cap (aborted beyond → 204), bytes are
 * returned with the upstream content-type + `cache-control: public, max-age=86400, stale-while-revalidate=604800` +
 * `x-img-source: upstream|cache`. An in-memory LRU (≤200 entries, ≤40 MB, TTL 1 h) keyed by URL avoids refetching across renders.
 * Any failure answers 204 (never 500) so the client-side onError fallback chain simply advances. `?probe=1` returns JSON
 * {ok,status,contentType,bytes} for the image audit. NO credentials or API keys are ever read or forwarded here.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 6000;
const MAX_REDIRECTS = 3;
const MAX_BYTES = 3 * 1024 * 1024;
const LRU_MAX_ENTRIES = 200;
const LRU_MAX_BYTES = 40 * 1024 * 1024;
const LRU_TTL_MS = 60 * 60 * 1000;
const CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

type Entry = { bytes: Uint8Array<ArrayBuffer>; contentType: string; at: number };
type Probe = { ok: boolean; status: number; contentType: string | null; bytes: number; error?: string };

// Module-level LRU (Map preserves insertion order; re-insert on hit = most recently used). Survives across requests within one
// warm server instance; lost on cold start, which is fine — the browser cache-control covers the rest.
const g = globalThis as unknown as { __imgLru?: Map<string, Entry>; __imgLruBytes?: number };
const lru: Map<string, Entry> = (g.__imgLru ??= new Map());
let lruBytes = g.__imgLruBytes ?? 0;

function lruGet(key: string): Entry | null {
  const e = lru.get(key);
  if (!e) return null;
  if (Date.now() - e.at > LRU_TTL_MS) { lru.delete(key); lruBytes -= e.bytes.byteLength; g.__imgLruBytes = lruBytes; return null; }
  lru.delete(key); lru.set(key, e);
  return e;
}
function lruSet(key: string, e: Entry) {
  if (e.bytes.byteLength > LRU_MAX_BYTES) return;
  const prev = lru.get(key);
  if (prev) { lru.delete(key); lruBytes -= prev.bytes.byteLength; }
  lru.set(key, e); lruBytes += e.bytes.byteLength;
  while (lru.size > LRU_MAX_ENTRIES || lruBytes > LRU_MAX_BYTES) {
    const oldest = lru.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    const o = lru.get(oldest)!; lru.delete(oldest); lruBytes -= o.bytes.byteLength;
  }
  g.__imgLruBytes = lruBytes;
}

const empty = (reason: string) => new Response(null, { status: 204, headers: { "cache-control": "public, max-age=600", "x-img-source": "none", "x-img-reason": reason } });
const bad = (msg: string) => new Response(msg, { status: 400, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
const json = (p: Probe) => Response.json(p, { headers: { "cache-control": "no-store" } });

/** True for loopback / private / link-local / unspecified addresses and obviously internal hostnames. */
function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (!h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".lan") || !h.includes(".") && isIP(h) === 0) return true;
  return isPrivateIp(h.replace(/^\[|\]$/g, ""));
}
function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === "::" || x === "::1") return true;
    if (x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe8") || x.startsWith("fe9") || x.startsWith("fea") || x.startsWith("feb")) return true;
    const m = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
    if (m) return isPrivateIp(m[1]);
  }
  return false;
}
/** Hostname-level check plus a DNS resolution check so a public name pointing at 127.0.0.1 is refused too. */
async function assertPublic(u: URL): Promise<string | null> {
  if (u.protocol !== "https:") return "https only";
  if (u.username || u.password) return "credentials in url";
  if (isPrivateHost(u.hostname)) return "private host";
  if (isIP(u.hostname.replace(/^\[|\]$/g, ""))) return null;
  try {
    const addrs = await lookup(u.hostname, { all: true });
    if (!addrs.length) return "unresolvable host";
    if (addrs.some((a) => isPrivateIp(a.address))) return "private address";
  } catch { return "unresolvable host"; }
  return null;
}

/** Fetch with manual redirect handling (≤3 hops, each hop validated) under one shared deadline. */
async function fetchImage(start: URL, signal: AbortSignal): Promise<{ res: Response; url: URL } | { error: string; status: number }> {
  let u = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const why = await assertPublic(u);
    if (why) return { error: why, status: 0 };
    const res = await fetch(u, {
      method: "GET", redirect: "manual", signal, cache: "no-store",
      headers: { "user-agent": UA, accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8", "accept-language": "en-US,en;q=0.9", referer: u.origin + "/" },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      await res.body?.cancel().catch(() => {});
      if (!loc) return { error: "redirect without location", status: res.status };
      if (hop === MAX_REDIRECTS) return { error: "too many redirects", status: res.status };
      u = new URL(loc, u);
      continue;
    }
    return { res, url: u };
  }
  return { error: "too many redirects", status: 0 };
}

/** Drain a body into memory, aborting as soon as it exceeds the cap. */
async function readCapped(res: Response, ctrl: AbortController): Promise<Uint8Array<ArrayBuffer> | null> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) { ctrl.abort(); return null; }
  if (!res.body) return null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) { ctrl.abort(); await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  const out = new Uint8Array(new ArrayBuffer(total));
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const raw = (sp.get("u") ?? "").trim();
  const probe = sp.get("probe") === "1";
  const wParam = Number(sp.get("w") ?? 0); // accepted for forward-compat (cache key); bytes are passed through unresized
  const w = Number.isFinite(wParam) && wParam > 0 ? Math.min(4096, Math.round(wParam)) : 0;

  if (!raw) return probe ? json({ ok: false, status: 400, contentType: null, bytes: 0, error: "missing u" }) : bad("missing u");
  let u: URL;
  try { u = new URL(raw); } catch { return probe ? json({ ok: false, status: 400, contentType: null, bytes: 0, error: "invalid url" }) : bad("invalid url"); }
  if (u.protocol === "http:") return probe ? json({ ok: false, status: 400, contentType: null, bytes: 0, error: "mixed content" }) : bad("mixed content: https only");
  if (u.protocol !== "https:") return probe ? json({ ok: false, status: 400, contentType: null, bytes: 0, error: "https only" }) : bad("https only");
  if (isPrivateHost(u.hostname)) return probe ? json({ ok: false, status: 400, contentType: null, bytes: 0, error: "private host" }) : bad("private host");

  const key = u.href + (w ? `#w=${w}` : "");
  const hit = lruGet(key);
  if (hit) {
    if (probe) return json({ ok: true, status: 200, contentType: hit.contentType, bytes: hit.bytes.byteLength });
    return new Response(hit.bytes, { status: 200, headers: { "content-type": hit.contentType, "content-length": String(hit.bytes.byteLength), "cache-control": CACHE_CONTROL, "x-img-source": "cache", "x-content-type-options": "nosniff" } });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetchImage(u, ctrl.signal);
    if ("error" in r) return probe ? json({ ok: false, status: r.status, contentType: null, bytes: 0, error: r.error }) : empty(r.error);
    const { res } = r;
    const ct = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!res.ok) { await res.body?.cancel().catch(() => {}); return probe ? json({ ok: false, status: res.status, contentType: ct || null, bytes: 0, error: `upstream ${res.status}` }) : empty(`upstream-${res.status}`); }
    if (!ct.startsWith("image/")) { await res.body?.cancel().catch(() => {}); return probe ? json({ ok: false, status: res.status, contentType: ct || null, bytes: 0, error: "not an image" }) : empty("not-image"); }
    const bytes = await readCapped(res, ctrl);
    if (!bytes || bytes.byteLength === 0) return probe ? json({ ok: false, status: res.status, contentType: ct, bytes: bytes?.byteLength ?? 0, error: bytes ? "empty body" : "too large" }) : empty(bytes ? "empty" : "too-large");
    lruSet(key, { bytes, contentType: ct, at: Date.now() });
    if (probe) return json({ ok: true, status: res.status, contentType: ct, bytes: bytes.byteLength });
    return new Response(bytes, { status: 200, headers: { "content-type": ct, "content-length": String(bytes.byteLength), "cache-control": CACHE_CONTROL, "x-img-source": "upstream", "x-content-type-options": "nosniff" } });
  } catch (e) {
    const msg = e instanceof Error ? (e.name === "AbortError" || e.name === "TimeoutError" ? "timeout" : e.message.slice(0, 120)) : "fetch failed";
    return probe ? json({ ok: false, status: 0, contentType: null, bytes: 0, error: msg }) : empty(msg === "timeout" ? "timeout" : "fetch-failed");
  } finally {
    clearTimeout(timer);
  }
}
