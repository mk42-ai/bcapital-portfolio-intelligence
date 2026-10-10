/**
 * Resolve + HTTP-verify a real logo for every portfolio company (TypeScript equivalent of
 * the python scratch run that produced the committed proof files).
 *
 *   PORTFOLIO_API_URL=https://... node node_modules/tsx/dist/cli.mjs scripts/resolve-logos.ts
 *
 * Resolution order per company (first candidate that verifies wins):
 *   a) the existing logo_url, b) https://logo.clearbit.com/{domain}, c) og:image from the
 *   homepage, d) https://www.google.com/s2/favicons?domain={domain}&sz=128, then the site's own
 *   <link rel="apple-touch-icon|icon">.
 * A candidate verifies when GET (10 s timeout, Mozilla UA, redirects followed) returns 200,
 * content-type image/* and a body > 500 bytes; PNG/JPEG/GIF headers are parsed to reject 1x1 /
 * sub-16px pixels. Output: proof/logo-resolution.json + proof/image-coverage.json.
 * This script never writes the database — run scripts/apply-logos.ts for that.
 */
import fs from "node:fs";
import path from "node:path";

const API = (process.env.PORTFOLIO_API_URL ?? "https://sb-3az18qgrrd3p.vercel.run").replace(/\/$/, "");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const WORKERS = 12;

type Company = { slug: string; name: string; website?: string | null; logo_url?: string | null; b_capital_role?: string };
type Source = "existing" | "clearbit" | "og" | "favicon" | "none";
type Verified = { ok: boolean; status: number | string | null; content_type: string | null; bytes: number; width: number | null; height: number | null };
type Result = {
  slug: string; name: string; domain: string | null; chosen_url: string | null; source: Source;
  status: number | string | null; content_type: string | null; bytes: number; width: number | null; height: number | null; checked_at: string;
};

const iso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

async function get(url: string, maxBytes = 2_000_000): Promise<{ status: number; ct: string; body: Buffer; finalUrl: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" }, redirect: "follow", signal: ctrl.signal });
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, ct: res.headers.get("content-type") ?? "", body: buf.subarray(0, maxBytes), finalUrl: res.url || url };
  } finally {
    clearTimeout(t);
  }
}

/** Minimal PNG / JPEG / GIF dimension sniffing (no deps). */
function dims(b: Buffer): [number, number] | null {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (b.length > 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return [b.readUInt16LE(6), b.readUInt16LE(8)];
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}

async function verify(url: string): Promise<Verified> {
  const out: Verified = { ok: false, status: null, content_type: null, bytes: 0, width: null, height: null };
  try {
    const r = await get(url);
    out.status = r.status;
    out.content_type = r.ct.split(";")[0].trim().toLowerCase();
    out.bytes = r.body.length;
    if (r.status !== 200 || !out.content_type.startsWith("image/") || r.body.length <= 500) return out;
    if (!out.content_type.includes("svg")) {
      const d = dims(r.body);
      if (d) {
        [out.width, out.height] = d;
        if (d[0] <= 1 || d[1] <= 1 || (d[0] < 16 && d[1] < 16)) return out;
      }
    }
    out.ok = true;
  } catch (e) {
    out.status = `error:${(e as Error).name}`;
  }
  return out;
}

function domainOf(website?: string | null): string | null {
  if (!website) return null;
  try {
    const h = new URL(/^https?:\/\//.test(website) ? website : `https://${website}`).hostname;
    return (h.startsWith("www.") ? h.slice(4) : h) || null;
  } catch {
    return null;
  }
}

async function homepage(domain: string): Promise<{ html: string; finalUrl: string } | null> {
  for (const scheme of ["https://", "https://www.", "http://"]) {
    try {
      const r = await get(scheme + domain, 600_000);
      if (r.status === 200) return { html: r.body.toString("utf8"), finalUrl: r.finalUrl };
    } catch { /* next scheme */ }
  }
  return null;
}

function ogImage(html: string, base: string): string | null {
  const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  return m ? new URL(m[1].trim(), base).toString() : null;
}

function siteIcon(html: string, base: string): string | null {
  let best: [number, string] | null = null;
  for (const l of html.match(/<link[^>]+>/gi) ?? []) {
    const rel = l.match(/rel=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const href = l.match(/href=["']([^"']+)["']/i)?.[1];
    if (!rel || !href || !rel.includes("icon")) continue;
    const score = rel.includes("apple-touch") ? 2 : 1;
    if (!best || score > best[0]) best = [score, new URL(href.trim(), base).toString()];
  }
  return best ? best[1] : null;
}

async function resolve(c: Company): Promise<Result> {
  const domain = domainOf(c.website);
  const checked_at = iso();
  const none: Result = { slug: c.slug, name: c.name, domain, chosen_url: null, source: "none", status: null, content_type: null, bytes: 0, width: null, height: null, checked_at };
  const pick = (source: Source, url: string, v: Verified): Result => ({ ...none, chosen_url: url, source, status: v.status, content_type: v.content_type, bytes: v.bytes, width: v.width, height: v.height });

  if (c.logo_url && /^https?:\/\//.test(c.logo_url)) {
    const url = encodeURI(c.logo_url);
    const v = await verify(url);
    if (v.ok) return pick("existing", url, v);
  }
  if (!domain) return none;
  const cb = `https://logo.clearbit.com/${domain}`;
  const vcb = await verify(cb);
  if (vcb.ok) return pick("clearbit", cb, vcb);
  const page = await homepage(domain);
  const og = page ? ogImage(page.html, page.finalUrl) : null;
  if (og) {
    const v = await verify(og);
    if (v.ok) return pick("og", og, v);
  }
  const fav = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  const vf = await verify(fav);
  if (vf.ok) return pick("favicon", fav, vf);
  const icon = page ? siteIcon(page.html, page.finalUrl) : null;
  if (icon) {
    const v = await verify(icon);
    if (v.ok) return pick("favicon", icon, v);
  }
  return none;
}

async function main() {
  const res = await fetch(`${API}/companies?limit=200`, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`companies fetch failed: ${res.status}`);
  const json = (await res.json()) as { data: Company[] };
  const companies = json.data.filter((c) => c.slug !== "b-capital" && c.b_capital_role !== "firm");
  console.error(`companies: ${companies.length}`);

  const results: Result[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: WORKERS }, async () => {
      while (next < companies.length) {
        const c = companies[next++];
        results.push(await resolve(c));
      }
    }),
  );
  results.sort((a, b) => a.slug.localeCompare(b.slug));

  const by_source: Record<string, number> = {};
  for (const r of results) by_source[r.source] = (by_source[r.source] ?? 0) + 1;
  const missing = results.filter((r) => r.source === "none").map((r) => r.slug);
  const proofDir = path.resolve(process.cwd(), "proof");
  fs.mkdirSync(proofDir, { recursive: true });
  fs.writeFileSync(path.join(proofDir, "logo-resolution.json"), JSON.stringify(results, null, 2));
  const coverage = { checked_at: iso(), companies_total: results.length, with_logo: results.length - missing.length, by_source, missing };
  fs.writeFileSync(path.join(proofDir, "image-coverage.json"), JSON.stringify(coverage, null, 2));
  console.log(JSON.stringify(coverage));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
