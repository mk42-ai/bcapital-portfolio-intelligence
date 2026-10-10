#!/usr/bin/env node
// Regenerates web/src/data/pitchbook-snapshot.json from the live backend: GET {BASE}/pitchbook/<slug> for every company slug in
// src/data/snapshot.json. Keeps only {name,data,next_run_utc} per slug so the file stays small (≤ 2 MB) — it is the offline fallback
// used by getPitchbook() so the PitchBook panel always has content on first paint even when the sandbox backend is down.
// Usage: node scripts/pitchbook-snapshot.mjs  (env PORTFOLIO_API_URL overrides the backend)
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.PORTFOLIO_API_URL ?? "https://sb-4y5v8t21stuf.vercel.run").replace(/\/$/, "");
const snapPath = resolve(here, "../src/data/snapshot.json");
const outPath = resolve(here, "../src/data/pitchbook-snapshot.json");
const snap = JSON.parse(await readFile(snapPath, "utf8"));
const slugs = [...new Set(snap.companies.map((c) => c.slug))];

async function one(slug) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000);
      const r = await fetch(`${BASE}/pitchbook/${encodeURIComponent(slug)}`, { headers: { accept: "application/json" }, signal: ctl.signal });
      clearTimeout(t);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      return { name: j.name ?? slug, data: j.data ?? null, next_run_utc: j.next_run_utc ?? null };
    } catch (e) { if (attempt === 2) { console.error(`! ${slug}: ${e.message}`); return null; } await new Promise((res) => setTimeout(res, 500 * (attempt + 1))); }
  }
  return null;
}

const out = {}; let i = 0; const CONC = 6;
await Promise.all(Array.from({ length: CONC }, async () => { while (i < slugs.length) { const s = slugs[i++]; const v = await one(s); if (v) out[s] = v; } }));
const json = JSON.stringify({ fetched_at: new Date().toISOString(), source: BASE, records: out });
await writeFile(outPath, json + "\n");
const withData = Object.values(out).filter((v) => v.data).length;
console.log(`wrote ${outPath}: ${Object.keys(out).length}/${slugs.length} slugs (${withData} with data), ${(json.length / 1024).toFixed(0)} KB`);
