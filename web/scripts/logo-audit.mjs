#!/usr/bin/env node
// Logo audit — Node 22, no deps. Fetches every company from the backend, HEAD-less GETs each logo_url with a browser UA
// (redirect: follow), and records status / content-type / byte length. No decoding (browser naturalWidth>0 is checked
// later by the Playwright QA pass → browserCheck: "pending"). Output: proof/logo-audit.json
import { writeFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BACKEND = (process.env.BACKEND || "https://sb-7d0g7nrod31w.vercel.run").replace(/\/+$/, "");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const TIMEOUT_MS = 15000;
const CONCURRENCY = 8;

// Keep in sync with src/lib/local-logos.ts (parsed from source so the map has a single owner).
async function loadLocalLogos() {
  try {
    const src = await readFile(path.join(ROOT, "src/lib/local-logos.ts"), "utf8");
    const body = src.match(/LOCAL_LOGOS[^=]*=\s*\{([\s\S]*?)\};/)?.[1] ?? "";
    const map = {};
    for (const m of body.matchAll(/["']([^"']+)["']\s*:\s*["']([^"']+)["']/g)) map[m[1]] = m[2];
    return map;
  } catch { return { "perplexity-ai": "/brand/logos/perplexity.svg" }; }
}

async function probe(url) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { redirect: "follow", signal: ctl.signal, headers: { "user-agent": UA, accept: "image/avif,image/webp,image/svg+xml,image/*,*/*;q=0.8" } });
    const buf = new Uint8Array(await r.arrayBuffer());
    return { status: r.status, contentType: r.headers.get("content-type") || null, bytes: buf.byteLength, finalUrl: r.url !== url ? r.url : undefined };
  } catch (e) { return { status: 0, contentType: null, bytes: 0, error: e?.name === "AbortError" ? "timeout" : String(e?.message || e) }; }
  finally { clearTimeout(t); }
}

async function main() {
  const LOCAL = await loadLocalLogos();
  const res = await fetch(`${BACKEND}/companies?limit=200`, { headers: { "user-agent": UA, accept: "application/json" } });
  if (!res.ok) throw new Error(`backend ${res.status} for ${BACKEND}/companies`);
  const json = await res.json();
  const companies = Array.isArray(json) ? json : json.data ?? json.companies ?? json.items ?? [];
  const rows = new Array(companies.length);
  let idx = 0;
  async function worker() {
    while (idx < companies.length) {
      const i = idx++; const c = companies[i];
      const slug = c.slug, name = c.name, logo_url = c.logo_url ?? null;
      const row = { slug, name, logo_url, status: null, contentType: null, bytes: 0, result: "fallback" };
      if (LOCAL[slug]) { Object.assign(row, { result: "fixed", localAsset: LOCAL[slug] }); }
      const isHttp = typeof logo_url === "string" && /^https?:\/\//i.test(logo_url);
      if (isHttp) {
        const p = await probe(logo_url); Object.assign(row, p);
        const isImage = !!p.contentType && /^image\//i.test(p.contentType) && p.bytes > 0;
        if (row.result !== "fixed") row.result = p.status === 200 && isImage ? "ok" : "fallback";
        if (!isImage && p.status === 200) row.note = "non-image content-type";
      } else if (row.result !== "fixed") row.note = logo_url ? "logo_url is not an http(s) URL" : "no logo_url";
      rows[i] = row;
      process.stderr.write(`${String(i + 1).padStart(3)}/${companies.length} ${slug.padEnd(28)} ${String(row.status ?? "-").padEnd(4)} ${(row.contentType ?? "-").slice(0, 28).padEnd(28)} ${row.result}\n`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const count = (k) => rows.filter((r) => r.result === k).length;
  const out = { generatedAt: new Date().toISOString(), backend: BACKEND, browserCheck: "pending", localLogos: LOCAL, total: rows.length, ok: count("ok"), fixed: count("fixed"), fallback: count("fallback"), rows };
  await mkdir(path.join(ROOT, "proof"), { recursive: true });
  await writeFile(path.join(ROOT, "proof/logo-audit.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(JSON.stringify({ total: out.total, ok: out.ok, fixed: out.fixed, fallback: out.fallback, backend: BACKEND, file: "proof/logo-audit.json" }));
  const bad = rows.filter((r) => r.result === "fallback");
  if (bad.length) console.log("fallback rows:\n" + bad.map((r) => `  ${r.slug}  status=${r.status ?? "-"}  ct=${r.contentType ?? "-"}  ${r.note ?? r.error ?? ""}  ${r.logo_url ?? ""}`).join("\n"));
}
main().catch((e) => { console.error(e); process.exit(1); });
