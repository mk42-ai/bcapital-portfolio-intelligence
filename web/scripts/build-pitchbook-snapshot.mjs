#!/usr/bin/env node
/**
 * Build the committed PitchBook snapshot (src/data/pitchbook-snapshot.json) from the live portfolio backend.
 *
 * Why: the company page card and the chat inspector drawer render PitchBook facts on FIRST PAINT from this file — no browser request to
 * /pitchbook | /execute | /workflow on load, no "Run now" button, no execution ids. The weekly workflow (Mon 06:00 UTC) refreshes the
 * backend; re-run this script (`cd web && node scripts/build-pitchbook-snapshot.mjs`) to refresh the committed snapshot.
 *
 * Sources merged per company slug (companies list minus the firm row):
 *   GET /companies/<slug>          → name, hq, sector, employees, website, b_capital_round
 *   GET /companies/<slug>/profile  → hq, sector, headcount, founded, funding_rounds[]  (value "unknown" ⇒ null)
 *   GET /pitchbook/<slug>          → last_round, investors.matched (≤8, trimmed), total_reported, brief, availability, provenance
 * Every fact carries {value, source, fetched_at, plugin} provenance (source = source_url, else company website).
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = (process.env.PORTFOLIO_API_URL || "https://sb-l72jsdzjb4nt.vercel.run").replace(/\/$/, "");
const PLUGIN_ID = "plugin-1777018662";
const CONCURRENCY = 8;
const TIMEOUT_MS = 10_000;
const MAX_INVESTORS = 8;
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../src/data/pitchbook-snapshot.json");

/* ---------- fetch helpers ---------- */
async function getJson(path, retries = 2) {
  for (let attempt = 0; ; attempt++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(`${BASE}${path}`, { headers: { accept: "application/json" }, signal: ctl.signal });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (attempt >= retries) { console.warn(`  ! ${path}: ${e.message}`); return null; }
    } finally { clearTimeout(t); }
  }
}
async function pool(items, worker, size = CONCURRENCY) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    for (;;) { const idx = i++; if (idx >= items.length) return; out[idx] = await worker(items[idx], idx); }
  }));
  return out;
}

/* ---------- normalisation ---------- */
const str = (v) => { if (v == null) return null; const s = String(v).trim(); return s && s.toLowerCase() !== "unknown" && s !== "—" ? s : null; };
const known = (pf) => pf && typeof pf === "object" ? str(pf.value) : null;
const field = (value, source, fetched_at, plugin) => {
  const v = str(value); if (!v) return null;
  const f = { value: v }; if (str(source)) f.source = str(source); if (str(fetched_at)) f.fetched_at = str(fetched_at); if (str(plugin)) f.plugin = str(plugin);
  return f;
};
const fromProfile = (pf, fallbackSource) => (known(pf) ? field(pf.value, pf.source_url || fallbackSource, pf.fetched_at, pf.plugin) : null);
const fromCompany = (value, company) => field(value, company.sources?.[0] || company.website, company.last_checked || company.updated_at, null);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(+v) ? +v : null);
const website = (w) => { const s = str(w); if (!s) return null; return /^https?:\/\//i.test(s) ? s : `https://${s}`; };

function fmtRound(r) {
  if (!r || typeof r !== "object") return null;
  const parts = [str(r.round), str(r.amount_text) || (num(r.amount_usd) != null ? `$${(r.amount_usd / 1e6).toFixed(0)}M` : null), str(r.date)].filter(Boolean);
  const leads = Array.isArray(r.lead_investors) ? r.lead_investors.map(str).filter(Boolean) : [];
  if (leads.length) parts.push(`led by ${leads.join(", ")}`);
  return parts.length ? parts.join(" · ") : null;
}
function lastDeal(pb, profile, company) {
  const lr = pb?.last_round; const txt = fmtRound(lr?.value);
  if (txt) return field(txt, lr.source_url || company.website, lr.fetched_at || pb?.provenance?.fetched_at, lr.plugin_id || PLUGIN_ID);
  const fr = Array.isArray(profile?.funding_rounds) ? profile.funding_rounds.find((x) => fmtRound(x)) : null;
  if (fr) return field(fmtRound(fr), fr.source_url || company.website, fr.fetched_at || profile?.fetched_at, fr.plugin);
  return fromCompany(company.b_capital_round, company);
}
function investors(pb) {
  const matched = Array.isArray(pb?.investors?.matched) ? pb.investors.matched : [];
  return matched.filter((m) => m && str(m.name)).slice(0, MAX_INVESTORS).map((m) => {
    const o = { name: str(m.name) };
    const w = website(m.website); if (w) o.website = w;
    if (str(m.location)) o.location = str(m.location); if (str(m.type)) o.type = str(m.type); if (num(m.aum_musd) != null) o.aum_musd = num(m.aum_musd);
    return o;
  });
}

function buildEntry(company, profile, pb, nextRun) {
  const entry = {
    slug: company.slug,
    name: str(company.name) || company.slug,
    hq: fromProfile(profile?.hq, company.website) || fromCompany(company.hq, company),
    industry: fromProfile(profile?.sector, company.website) || fromCompany(company.sector, company),
    employees: fromProfile(profile?.headcount, company.website) || fromCompany(company.employees != null ? Number(company.employees).toLocaleString("en-US") : null, company),
    founded: fromProfile(profile?.founded, company.website),
    last_deal: lastDeal(pb, profile, company),
    investors: investors(pb),
    investors_total: num(pb?.investors?.total_reported),
    investors_brief: str(pb?.investors?.brief),
    availability: pb?.availability && typeof pb.availability === "object" ? pb.availability : {},
    fetched_at: str(pb?.provenance?.fetched_at) || str(pb?.fetched_at),
    next_run_utc: nextRun,
  };
  // compact: drop null / empty-string / empty-object members except the typed nullable ones the UI reads
  for (const k of Object.keys(entry)) if (entry[k] === "" ) entry[k] = null;
  return entry;
}

/* ---------- main ---------- */
async function main() {
  console.log(`PitchBook snapshot ← ${BASE}`);
  const [list, pbList] = await Promise.all([getJson("/companies?limit=200"), getJson("/pitchbook?limit=200")]);
  const companies = (list?.data ?? []).filter((c) => c && c.slug && c.b_capital_role !== "firm");
  if (!companies.length) throw new Error("no companies returned");
  const nextRun = str(pbList?.next_run_utc) || null; const workflowId = str(pbList?.workflow_id) || null;
  console.log(`  ${companies.length} companies · ${pbList?.data?.length ?? 0} pitchbook rows · next run ${nextRun ?? "?"}`);

  let done = 0;
  const entries = await pool(companies, async (c) => {
    const [detail, profile, pb] = await Promise.all([
      getJson(`/companies/${encodeURIComponent(c.slug)}`), getJson(`/companies/${encodeURIComponent(c.slug)}/profile`), getJson(`/pitchbook/${encodeURIComponent(c.slug)}`),
    ]);
    const company = { ...c, ...(detail?.data ?? {}) };
    const e = buildEntry(company, profile?.data ?? null, pb?.data ?? null, str(pb?.next_run_utc) || nextRun);
    if (++done % 20 === 0) process.stdout.write(`  … ${done}/${companies.length}\n`);
    return e;
  });

  const snapshot = {
    fetched_at: new Date().toISOString(), source: BASE, workflow_id: workflowId, plugin_id: PLUGIN_ID,
    companies: Object.fromEntries(entries.sort((a, b) => a.slug.localeCompare(b.slug)).map((e) => [e.slug, e])),
  };
  await mkdir(dirname(OUT), { recursive: true });
  const json = JSON.stringify(snapshot);
  await writeFile(OUT, json + "\n");

  const n = entries.length; const cov = (k) => entries.filter((e) => e[k] != null && (!Array.isArray(e[k]) || e[k].length)).length;
  console.log(`\nwrote ${OUT} (${(Buffer.byteLength(json) / 1024).toFixed(1)} KB)`);
  console.log(`entries: ${n}`);
  for (const k of ["hq", "industry", "employees", "founded", "last_deal", "investors", "investors_total", "investors_brief", "fetched_at"]) console.log(`  ${k.padEnd(16)} ${cov(k)}/${n}`);
  const fromPb = entries.filter((e) => e.last_deal?.plugin === PLUGIN_ID || e.last_deal?.plugin === "answer").length;
  console.log(`  last_deal from pitchbook/profile: ${fromPb}; from b_capital_round: ${cov("last_deal") - fromPb}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
