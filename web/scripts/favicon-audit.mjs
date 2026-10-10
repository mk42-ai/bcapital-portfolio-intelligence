#!/usr/bin/env node
// Favicon audit — Node 22, no deps. Requests every URL in each plugin's favicon chain
// (logoUrl → Google s2) plus the s2 favicon for the five context companies, and writes proof/favicon-audit.json.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const CONTEXT_DOMAINS = ["perplexity.ai", "apptronik.com", "fervoenergy.com", "flutterwave.com", "writer.com"];

const isHttp = (u) => typeof u === "string" && /^https?:\/\//i.test(u);
const s2 = (domain) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
const chainFor = (p) => [...(isHttp(p.logoUrl) ? [p.logoUrl] : []), s2(p.domain)];
const kindOf = (url) => (url.startsWith("https://www.google.com/s2/favicons") ? "s2" : "logo");

async function probe(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 10_000);
  try {
    const r = await fetch(url, { redirect: "follow", signal: ctl.signal, headers: { "user-agent": UA, accept: "image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5" } });
    const buf = Buffer.from(await r.arrayBuffer());
    const contentType = r.headers.get("content-type") ?? "";
    return { url, kind: kindOf(url), status: r.status, contentType, bytes: buf.length, ok: r.status === 200 && contentType.startsWith("image/") };
  } catch (e) {
    return { url, kind: kindOf(url), status: 0, contentType: "", bytes: 0, ok: false, error: e?.name === "AbortError" ? "timeout" : String(e?.message ?? e) };
  } finally { clearTimeout(t); }
}

const cat = JSON.parse(await readFile(path.join(root, "src/data/plugin-catalogue.json"), "utf8"));
const plugins = cat.plugins;
const summary = { logo: 0, s2: 0, monogram: 0, failures: [] };
const byPlugin = [];
for (const p of plugins) {
  const chain = [];
  for (const url of chainFor(p)) chain.push(await probe(url));
  const first = chain.find((c) => c.ok);
  const used = first ? first.kind : "monogram";
  summary[used]++;
  for (const c of chain) if (!c.ok) summary.failures.push({ id: p.id, name: p.name, url: c.url, status: c.status, contentType: c.contentType, error: c.error });
  byPlugin.push({ id: p.id, name: p.name, domain: p.domain, chain, used });
  console.log(`${used.padEnd(8)} ${p.id}  ${p.name}  ${chain.map((c) => `${c.kind}:${c.status}${c.ok ? "" : "✗"}`).join(" ")}`);
}
const contextCompanies = [];
for (const d of CONTEXT_DOMAINS) { const r = await probe(s2(d)); contextCompanies.push({ domain: d, ...r }); if (!r.ok) summary.failures.push({ context: d, url: r.url, status: r.status, contentType: r.contentType, error: r.error }); console.log(`context  ${d}  s2:${r.status}${r.ok ? "" : "✗"} ${r.contentType} ${r.bytes}B`); }

const out = { generatedAt: new Date().toISOString(), totalPlugins: plugins.length, byPlugin, contextCompanies, summary };
await mkdir(path.join(root, "proof"), { recursive: true });
await writeFile(path.join(root, "proof/favicon-audit.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`\nsummary: logo=${summary.logo} s2=${summary.s2} monogram=${summary.monogram} failures=${summary.failures.length} → proof/favicon-audit.json`);
