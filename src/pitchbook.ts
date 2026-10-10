/**
 * pitchbook.ts — PitchBook normaliser on top of the ONLY PitchBook plugin in the OnDemand directory.
 *
 * Ground truth (proof/pitchbook/discovery.json): `GET /plugin/v1/search?query=pitchbook` → exactly one plugin, plugin-1777018662
 * "Pitchbook Investor Finder" (agent-1777018662, auth NONE — the account holds the PitchBook token server-side, isSubscribed true).
 * Its single operation `searchInvestors` turns a free-text fundraising brief into ≤10 enriched investor profiles. It has NO company-profile
 * operation: a company-profile query (session 6aca396cf7979c7d562af497) made the planner skip the plugin, while an investor brief
 * (session 6aca399995268adc215e0bf1) returned 106 matches with real PitchBook data.
 *
 * Honesty rules: investors = VERIFIED from the plugin; overview / last_round / valuation_history / financials / comparables are
 * NOT_AVAILABLE_FROM_PLUGIN (not a credentials problem). overview/last_round are back-filled from the enrichment profile row when one
 * exists and are then labelled FROM_ENRICHMENT with the enrichment plugin as provenance — never presented as PitchBook data.
 */
import { eq } from "drizzle-orm";
import { getDb, persist, nowIso, schema } from "./db/client.js";
import { config, ONDEMAND_REASONING_MODE, ONDEMAND_USER_AGENT } from "./config.js";
import { getProfile } from "./enrich.js";

export const PITCHBOOK_PLUGIN_ID = "plugin-1777018662";
export const PITCHBOOK_AGENT_ID = "agent-1777018662";
export const PITCHBOOK_SOURCE = "pitchbook-investor-finder";
const ONDEMAND_BASE = process.env.ONDEMAND_BASE_URL ?? "https://api.on-demand.io";
const STREAM_TIMEOUT_MS = 240_000;
const headers = () => { const k = process.env.ONDEMAND_API_KEY ?? ""; if (!k) throw new Error("ONDEMAND_API_KEY is not configured"); return { apikey: k, "content-type": "application/json", "user-agent": ONDEMAND_USER_AGENT }; };

export type Sourced<T = unknown> = { value: T; source_url: string | null; published_date: string | null; fetched_at: string; plugin_id: string | null };
export type PitchbookInvestor = {
  name: string; website: string | null; location: string | null; year_founded: number | null; status: string | null; type: string | null;
  aum_musd: number | null; dry_powder_musd: number | null; team_size: number | null; investment_range: string | null;
  deal_types: string[]; industries: string[]; verticals: string[]; geographies: string[]; preferences: string[];
};
export type Availability = "VERIFIED" | "NOT_AVAILABLE_FROM_PLUGIN" | "FROM_ENRICHMENT";
export type PitchbookRecord = {
  slug: string;
  overview: Sourced | null;
  last_round: Sourced | null;
  valuation_history: Sourced[];
  investors: { matched: PitchbookInvestor[]; brief: string; total_reported: number | null };
  financials: Sourced | null;
  comparables: Sourced[];
  provenance: { plugin_id: typeof PITCHBOOK_PLUGIN_ID; session_id: string | null; fetched_at: string; source: typeof PITCHBOOK_SOURCE; note?: string; plugin_calls?: number; errors?: string[] };
  availability: { overview: Availability; last_round: Availability; valuation_history: Availability; financials: Availability; comparables: Availability; investors: Availability };
};

export type BriefInput = { name: string; sector: string; stage?: string | null; hq?: string | null; description?: string | null; last_round_text?: string | null; region?: string | null; ticket_usd?: number | null };

/** Sector → PitchBook-ish investor vocabulary for the brief. */
const SECTOR_HINTS: Record<string, { types: string; verticals: string }> = {
  technology: { types: "Venture Capital, Growth Equity, Corporate Venture Capital", verticals: "Software, SaaS, AI/ML, Fintech, Enterprise Tech" },
  healthcare: { types: "Venture Capital, Growth Equity, Healthcare-focused funds", verticals: "HealthTech, Digital Health, Life Sciences, Biotech" },
  "energy & resilience": { types: "Venture Capital, Growth Equity, Infrastructure funds, Strategic energy investors", verticals: "CleanTech, Climate Tech, Energy Transition, Infrastructure" },
  opportunistic: { types: "Venture Capital, Growth Equity, Crossover funds", verticals: "Technology, Consumer, Industrials" },
};
const stageFrom = (s: string | null | undefined): string => {
  const t = (s ?? "").toLowerCase();
  if (/seed|pre-seed/.test(t)) return "Seed / Series A";
  if (/series a\b/.test(t)) return "Series A / B";
  if (/series b\b/.test(t)) return "Series B / C";
  if (/series c\b/.test(t)) return "Series C / Growth";
  if (/series [d-h]\b|growth|late/.test(t)) return "Growth / Late Stage";
  if (/public|ipo/.test(t)) return "Public / PIPE / Crossover";
  return "Growth (Series B+)";
};
const fmtUsd = (n: number): string => (n >= 1e9 ? `$${+(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${Math.round(n / 1e6)}M` : `$${Math.round(n / 1e3)}K`);

/** Plain-text brief in the plugin's documented format (the exact field labels the planner forwarded verbatim in session 6aca399995268adc215e0bf1). */
export function buildInvestorBrief(company: BriefInput): string {
  const hint = SECTOR_HINTS[(company.sector ?? "").toLowerCase()] ?? SECTOR_HINTS.opportunistic;
  const stage = stageFrom(company.stage);
  const lr = (company.last_round_text ?? "").trim();
  const lrAmt = lr.match(/\$\s?([\d.,]+)\s*(bn|b|billion|m|mm|million)?/i);
  let raise = "$50-150M";
  if (lrAmt) { const n = parseFloat(lrAmt[1].replace(/,/g, "")); const u = (lrAmt[2] ?? "m").toLowerCase(); const usd = n * (u.startsWith("b") ? 1e9 : 1e6); raise = `${fmtUsd(usd * 0.8)}-${fmtUsd(usd * 1.5)}`; }
  else if (/seed/i.test(stage)) raise = "$5-25M"; else if (/Series A/.test(stage)) raise = "$15-50M"; else if (/Series B/.test(stage)) raise = "$30-100M"; else if (/Public/.test(stage)) raise = "$100-500M";
  let ticket = "$5-50M";
  if (company.ticket_usd && company.ticket_usd > 0) ticket = `${fmtUsd(company.ticket_usd * 0.5)}-${fmtUsd(company.ticket_usd * 2)}`;
  else if (/seed/i.test(stage)) ticket = "$1-10M"; else if (/Growth|Public/.test(stage)) ticket = "$25-100M";
  const geo = company.region ? company.region : company.hq ? company.hq.split(",").pop()!.trim() : "Global";
  const what = [company.description?.trim(), company.hq ? `based in ${company.hq}` : null, `sector: ${company.sector}`].filter(Boolean).join("; ");
  return [
    `Stage: ${stage}`,
    `Raise Size (USD): ${raise}`,
    `Investor types: ${hint.types}`,
    `Target geographies: ${geo}`,
    `Ticket size range: ${ticket}`,
    `Industry / verticals: ${hint.verticals}`,
    `What the company does: ${company.name} — ${what || company.sector}`,
  ].join("\n");
}

// ---------- parser ----------
const money = (s: string | undefined | null): number | null => { if (!s) return null; const m = s.replace(/,/g, "").match(/\$?\s*([\d.]+)\s*(bn|b|billion|m|mm|million|k)?/i); if (!m) return null; const n = parseFloat(m[1]); if (!Number.isFinite(n)) return null; const u = (m[2] ?? "m").toLowerCase(); return +(u.startsWith("b") ? n * 1000 : u === "k" ? n / 1000 : n).toFixed(1); };
const list = (s: string | undefined | null): string[] => (s ?? "").split(/,\s*|;\s*/).map((x) => x.replace(/\*+/g, "").trim()).filter((x) => x && !/^(and|etc\.?)$/i.test(x));
const strip = (s: string) => s.replace(/\*+/g, "").trim();
const cleanWeb = (s: string | undefined | null): string | null => { if (!s) return null; const m = s.match(/((?:https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s)]*)?)/i); return m ? m[1].replace(/[.,;)]+$/, "") : null; };

/**
 * Robust markdown parser for the plugin's numbered blocks:
 *   `1. **Name** — City, ST (Type)[ — *Status: X*]` followed by `- Key: value | Key2: value2` bullet lines.
 * Pure (no I/O) so it is unit-testable against the fixture copied from the live answer.
 */
export function parseInvestorAnswer(answer: string): PitchbookInvestor[] {
  const lines = answer.replace(/\r/g, "").split("\n");
  const out: PitchbookInvestor[] = [];
  let cur: PitchbookInvestor | null = null;
  const headRe = /^\s*(\d+)[.)]\s+\*\*(.+?)\*\*\s*(?:[—–-]\s*(.*))?$/;
  const applyKV = (inv: PitchbookInvestor, key: string, val: string) => {
    const k = key.toLowerCase().trim(); const v = strip(val);
    if (!v) return;
    if (k === "aum") inv.aum_musd = money(v);
    else if (/dry\s*powder/.test(k)) inv.dry_powder_musd = money(v);
    else if (/investment range|ticket/.test(k)) inv.investment_range = v;
    else if (/deal types?/.test(k)) inv.deal_types = list(v);
    else if (/^industr/.test(k) || /sectors?/.test(k)) inv.industries = list(v);
    else if (/^verticals?( include)?$/.test(k) || /verticals/.test(k)) inv.verticals = list(v);
    else if (/geograph|regions?/.test(k)) inv.geographies = list(v);
    else if (/preferences?/.test(k)) inv.preferences = list(v);
    else if (/website|url|site/.test(k)) inv.website = cleanWeb(v);
    else if (/status/.test(k)) inv.status = v;
    else if (/^type$/.test(k)) inv.type = v;
    else if (/location|hq|headquarter/.test(k)) inv.location = v;
    else if (/team size|employees|professionals/.test(k)) { const m = v.match(/\d[\d,]*/); inv.team_size = m ? parseInt(m[0].replace(/,/g, ""), 10) : null; }
    else if (/founded|year founded/.test(k)) { const m = v.match(/\b(18|19|20)\d{2}\b/); inv.year_founded = m ? parseInt(m[0], 10) : null; }
  };
  for (const rawLine of lines) {
    const h = rawLine.match(headRe);
    if (h) {
      const name = strip(h[2]); if (!name) continue;
      cur = { name, website: null, location: null, year_founded: null, status: null, type: null, aum_musd: null, dry_powder_musd: null, team_size: null, investment_range: null, deal_types: [], industries: [], verticals: [], geographies: [], preferences: [] };
      const tail = h[3] ?? "";
      const st = tail.match(/\*?Status:\s*([^*]+?)\*?\s*$/i); if (st) cur.status = st[1].trim();
      const head = tail.replace(/\s*[—–-]\s*\*?Status:[^*]*\*?\s*$/i, "").trim();
      const lt = head.match(/^(.*?)\s*\(([^()]+)\)\s*$/); if (lt) { cur.location = strip(lt[1]) || null; cur.type = strip(lt[2]) || null; } else if (head) cur.location = strip(head) || null;
      out.push(cur); continue;
    }
    if (!cur) continue;
    const b = rawLine.match(/^\s*[-•*]\s+(.*)$/); if (!b) { if (/^\s*\*\*/.test(rawLine) || /^\s*$/.test(rawLine)) continue; continue; }
    const body = b[1].trim();
    // Free-text "Founded 1988; prefers to invest in the energy sector" / "invests in energy ... across Asia-Pacific, Europe"
    const f = body.match(/^Founded\s+((?:18|19|20)\d{2})/i);
    if (f) { cur.year_founded = parseInt(f[1], 10); const geo = body.match(/across ([^.;]+)/i); if (geo) cur.geographies = list(geo[1].replace(/\band\b/g, ",")); const sec = body.match(/invest(?:s|ing)? in (?:the )?([^.;]+?)(?: sector| across|$)/i); if (sec && !cur.industries.length) cur.industries = list(sec[1].replace(/\band\b/g, ",")); continue; }
    // "Verticals include CleanTech, ..." (no colon)
    const vi = body.match(/^(Verticals|Industries|Geographies|Deal types)\s+include\s+(.*)$/i); if (vi) { applyKV(cur, vi[1], vi[2]); continue; }
    for (const seg of body.split(/\s+\|\s+/)) { const kv = seg.match(/^([A-Za-z][A-Za-z /]*?):\s*(.+)$/); if (kv) applyKV(cur, kv[1], kv[2]); }
  }
  // dedupe by name (the answer sometimes repeats a firm in "notes")
  const seen = new Set<string>(); return out.filter((i) => { const k = i.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}
/** "The search returned 106 total results" → 106. */
export function parseTotalReported(answer: string): number | null { const m = answer.match(/(\d[\d,]*)\s+(?:total\s+)?(?:results|matches|investors)\b/i); return m ? parseInt(m[1].replace(/,/g, ""), 10) : null; }

// ---------- OnDemand chat (same SSE pattern as enrich.ts streamQuery; copied, not imported) ----------
type StreamOut = { answer: string; pluginInvoked: boolean; pluginCalls: number; frames: number; eventTypes: Record<string, number>; stepOutput: string };
async function createSession(): Promise<string> {
  const res = await fetch(`${ONDEMAND_BASE}/chat/v1/sessions`, { method: "POST", headers: headers(), body: JSON.stringify({ externalUserId: "pitchbook-bot", pluginIds: [PITCHBOOK_PLUGIN_ID], contextMetadata: [{ key: "purpose", value: "pitchbook-investor-finder" }] }) });
  if (!res.ok) throw new Error(`session create failed: HTTP ${res.status}`);
  const json: any = await res.json(); const id = json?.data?.id ?? json?.id; if (!id) throw new Error("session create: no id"); return String(id);
}
async function streamQuery(sessionId: string, query: string): Promise<StreamOut> {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), STREAM_TIMEOUT_MS);
  const out: StreamOut = { answer: "", pluginInvoked: false, pluginCalls: 0, frames: 0, eventTypes: {}, stepOutput: "" };
  try {
    const res = await fetch(`${ONDEMAND_BASE}/chat/v1/sessions/${sessionId}/query`, { method: "POST", headers: { ...headers(), accept: "text/event-stream" }, body: JSON.stringify({ query, endpointId: config.ondemandDefaultModel, responseMode: "stream", pluginIds: [PITCHBOOK_PLUGIN_ID], reasoningMode: ONDEMAND_REASONING_MODE, modelConfigs: { temperature: 0.1 } }), signal: ctrl.signal });
    if (!res.ok || !res.body) throw new Error(`query failed: HTTP ${res.status}`);
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
    const handle = (line: string) => {
      if (!line.startsWith("data:")) return; const payload = line.slice(5).trim(); if (!payload || payload === "[DONE]") return;
      let f: any; try { f = JSON.parse(payload); } catch { return; }
      out.frames++; const et = String(f?.eventType ?? "?"); out.eventTypes[et] = (out.eventTypes[et] ?? 0) + 1;
      if (et === "step_output") { out.stepOutput += String(f?.output?.delta ?? ""); if (payload.includes(PITCHBOOK_PLUGIN_ID)) out.pluginInvoked = true; }
      if (et === "fulfillment" && typeof f?.answer === "string") out.answer += f.answer;
    };
    for (;;) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); let nl: number; while ((nl = buf.indexOf("\n")) >= 0) { handle(buf.slice(0, nl).replace(/\r$/, "")); buf = buf.slice(nl + 1); } }
    if (buf) handle(buf);
  } finally { clearTimeout(timer); }
  // step_output deltas are split mid-token, so detect on the concatenated text as well.
  if (out.stepOutput.includes(PITCHBOOK_PLUGIN_ID)) out.pluginInvoked = true;
  out.pluginCalls = (out.stepOutput.match(new RegExp(`"pluginId"\\s*:\\s*"${PITCHBOOK_PLUGIN_ID}"`, "g")) ?? []).length;
  return out;
}

export function emptyRecord(slug: string, brief: string, fetched: string): PitchbookRecord {
  return {
    slug, overview: null, last_round: null, valuation_history: [], investors: { matched: [], brief, total_reported: null }, financials: null, comparables: [],
    provenance: { plugin_id: PITCHBOOK_PLUGIN_ID, session_id: null, fetched_at: fetched, source: PITCHBOOK_SOURCE },
    availability: { overview: "NOT_AVAILABLE_FROM_PLUGIN", last_round: "NOT_AVAILABLE_FROM_PLUGIN", valuation_history: "NOT_AVAILABLE_FROM_PLUGIN", financials: "NOT_AVAILABLE_FROM_PLUGIN", comparables: "NOT_AVAILABLE_FROM_PLUGIN", investors: "VERIFIED" },
  };
}

/** Back-fill overview/last_round from the enrichment profile row (never claimed as PitchBook data). Exported for tests via `profile` injection. */
export function applyEnrichment(rec: PitchbookRecord, profile: Awaited<ReturnType<typeof getProfile>>): PitchbookRecord {
  if (!profile) return rec;
  const d = profile.description;
  if (d && d.value !== "unknown") { rec.overview = { value: d.value, source_url: d.source_url, published_date: d.published_date, fetched_at: d.fetched_at, plugin_id: d.plugin ?? "enrichment" }; rec.availability.overview = "FROM_ENRICHMENT"; }
  const fr = (profile.funding_rounds ?? [])[0];
  if (fr) { rec.last_round = { value: { date: fr.date, amount_usd: fr.amount_usd, amount_text: fr.amount_text, round: fr.round, lead_investors: fr.lead_investors }, source_url: fr.source_url, published_date: fr.published_date, fetched_at: fr.fetched_at, plugin_id: fr.plugin ?? "enrichment" }; rec.availability.last_round = "FROM_ENRICHMENT"; }
  return rec;
}

/** One company → one PitchBook record (investor search through plugin-1777018662 + enrichment back-fill). */
export async function fetchPitchbook(row: typeof schema.companies.$inferSelect, opts: { write?: boolean; brief?: string } = {}): Promise<PitchbookRecord> {
  const fetched = nowIso();
  const profile = await getProfile(row.slug).catch(() => null);
  // Brief inputs: the latest PRIVATE priced round (IPO / debt rows would inflate the raise size), the enrichment description and B Capital's ticket estimate.
  const lastRound = (profile?.funding_rounds ?? []).find((r) => !/ipo|debt|project financ|loan|grant/i.test(r.round));
  const brief = opts.brief ?? buildInvestorBrief({ name: row.name, sector: row.sector, stage: row.stage ?? lastRound?.round ?? null, hq: row.hq, region: row.region, description: profile && profile.description.value !== "unknown" ? String(profile.description.value) : null, last_round_text: lastRound ? `${lastRound.round} ${lastRound.amount_text}` : null, ticket_usd: row.estimatedTicketSizeUsd });
  const rec = emptyRecord(row.slug, brief, fetched);
  const errors: string[] = [];
  try {
    const sid = await createSession(); rec.provenance.session_id = sid;
    const s = await streamQuery(sid, `${brief}\n\nUse the PitchBook investor finder (searchInvestors) with this brief and list every matched investor as a numbered markdown block: "N. **Name** — City, ST (Type)" followed by bullet lines "AUM: $X | Dry powder: $Y", "Founded YYYY", "Investment range: ...", "Deal types: ...", "Industries: ...", "Verticals: ...", "Geographies: ...", "Preferences: ...", "Website: ...". State the total number of results returned.`);
    rec.provenance.plugin_calls = s.pluginCalls;
    if (!s.pluginInvoked) { rec.provenance.note = "plugin not invoked by planner"; rec.investors.matched = []; }
    else { rec.investors.matched = parseInvestorAnswer(s.answer); rec.investors.total_reported = parseTotalReported(s.answer); if (!rec.investors.matched.length) rec.provenance.note = "plugin invoked but the answer contained no parseable investor blocks"; }
  } catch (e) { errors.push(`stream: ${(e as Error)?.name === "AbortError" ? `timeout after ${STREAM_TIMEOUT_MS / 1000}s` : String((e as Error)?.message ?? e)}`); rec.provenance.note = rec.provenance.note ?? "plugin query failed"; }
  if (errors.length) rec.provenance.errors = errors;
  applyEnrichment(rec, profile);
  if (opts.write !== false) await writePitchbookRecord(rec);
  return rec;
}

// ---------- store ----------
export function ensurePitchbookTable(raw: { run: (sql: string) => unknown }) {
  raw.run(`create table if not exists pitchbook_records (slug text primary key, record text not null, fetched_at text not null, updated_at text not null)`);
}
export async function writePitchbookRecord(rec: PitchbookRecord): Promise<void> {
  const { raw } = await getDb(); ensurePitchbookTable(raw);
  const now = nowIso();
  raw.run(`insert into pitchbook_records (slug, record, fetched_at, updated_at) values (?, ?, ?, ?) on conflict(slug) do update set record = excluded.record, fetched_at = excluded.fetched_at, updated_at = excluded.updated_at`, [rec.slug, JSON.stringify(rec), rec.provenance.fetched_at || now, now]);
  persist();
}
export async function getPitchbookRecord(slug: string): Promise<PitchbookRecord | null> {
  const { raw } = await getDb(); ensurePitchbookTable(raw);
  const res = raw.exec(`select record from pitchbook_records where slug = ?`, [slug]);
  const r = res[0]?.values?.[0]; return r ? (JSON.parse(String(r[0])) as PitchbookRecord) : null;
}
export async function listPitchbookRecords(): Promise<{ slug: string; fetched_at: string; investors: number; availability: PitchbookRecord["availability"] }[]> {
  const { raw } = await getDb(); ensurePitchbookTable(raw);
  const res = raw.exec(`select slug, record, fetched_at from pitchbook_records order by slug`);
  return (res[0]?.values ?? []).map((v) => { const rec = JSON.parse(String(v[1])) as PitchbookRecord; return { slug: String(v[0]), fetched_at: String(v[2]), investors: rec.investors?.matched?.length ?? 0, availability: rec.availability }; });
}

/** Validate an externally supplied record (workflow webhook) and coerce it into the canonical shape. Returns an error string or the record. */
export function normaliseIncomingRecord(input: any, fetched: string): { ok: true; record: PitchbookRecord } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "record must be an object" };
  const slug = String(input.slug ?? "").trim().toLowerCase(); if (!slug) return { ok: false, error: "record.slug is required" };
  const inv = input.investors; if (!inv || typeof inv !== "object" || !Array.isArray(inv.matched)) return { ok: false, error: `${slug}: investors.matched[] is required` };
  const matched: PitchbookInvestor[] = [];
  for (const m of inv.matched) {
    if (!m || typeof m !== "object" || !String(m.name ?? "").trim()) return { ok: false, error: `${slug}: every investors.matched[] item needs a name` };
    const arr = (x: unknown) => (Array.isArray(x) ? x.map(String).map((s) => s.trim()).filter(Boolean) : typeof x === "string" ? list(x) : []);
    const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : typeof x === "string" ? money(x) : null);
    matched.push({ name: String(m.name).trim(), website: m.website ? String(m.website) : null, location: m.location ? String(m.location) : null, year_founded: typeof m.year_founded === "number" ? m.year_founded : m.year_founded ? parseInt(String(m.year_founded), 10) || null : null, status: m.status ? String(m.status) : null, type: m.type ? String(m.type) : null, aum_musd: num(m.aum_musd ?? m.aum), dry_powder_musd: num(m.dry_powder_musd ?? m.dry_powder), team_size: typeof m.team_size === "number" ? m.team_size : null, investment_range: m.investment_range ? String(m.investment_range) : null, deal_types: arr(m.deal_types), industries: arr(m.industries), verticals: arr(m.verticals), geographies: arr(m.geographies), preferences: arr(m.preferences) });
  }
  const rec = emptyRecord(slug, String(inv.brief ?? ""), String(input.provenance?.fetched_at ?? fetched));
  rec.investors.matched = matched; rec.investors.total_reported = Number.isFinite(Number(inv.total_reported)) && inv.total_reported !== null && inv.total_reported !== "" ? Number(inv.total_reported) : null;
  if (input.provenance?.session_id) rec.provenance.session_id = String(input.provenance.session_id);
  if (input.provenance?.note) rec.provenance.note = String(input.provenance.note);
  return { ok: true, record: rec };
}

/**
 * Salvage every COMPLETE {"slug":…,"investors":{…}} record from an LLM payload — the weekly node's output is truncated by the model's
 * output budget when all 136 companies land in one answer (execution 6aca3d9d300de84fa7121262: 92 records started, 91 complete, 260 663 chars).
 * Returns the parsed object when the whole text is valid JSON, otherwise the complete records only (+ the number of truncated ones).
 */
export function salvageRecords(text: string): { records: any[]; complete_json: boolean; truncated: number; workflow_name: string | null } {
  const i = text.indexOf("{"); const j = text.lastIndexOf("}");
  if (i >= 0 && j > i) { try { const o = JSON.parse(text.slice(i, j + 1)); if (o && Array.isArray(o.records)) return { records: o.records, complete_json: true, truncated: 0, workflow_name: typeof o.workflow_name === "string" ? o.workflow_name : null }; } catch { /* fall through to salvage */ } }
  const records: any[] = []; let truncated = 0;
  const wn = text.match(/"workflow_name"\s*:\s*"([^"]*)"/);
  const re = /\{\s*"slug"\s*:\s*"/g; let m: RegExpExecArray | null; const starts: number[] = [];
  while ((m = re.exec(text))) starts.push(m.index);
  for (let k = 0; k < starts.length; k++) {
    const seg = text.slice(starts[k], k + 1 < starts.length ? starts[k + 1] : undefined);
    // walk braces to find the balanced end of this record
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let c = 0; c < seg.length; c++) { const ch = seg[c]; if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; } if (ch === '"') inStr = true; else if (ch === "{") depth++; else if (ch === "}") { depth--; if (depth === 0) { end = c; break; } } }
    if (end < 0) { truncated++; continue; }
    try { const r = JSON.parse(seg.slice(0, end + 1)); if (r && r.slug && r.investors) records.push(r); else truncated++; } catch { truncated++; }
  }
  return { records, complete_json: false, truncated, workflow_name: wn ? wn[1] : null };
}

/** Next Monday 06:00 UTC strictly after `from` (matches the weekly workflow cron `0 0 6 * * 1`). */
export function nextMondayUtc(from: Date = new Date()): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 6, 0, 0));
  const dow = d.getUTCDay(); // 0 Sun … 1 Mon
  let add = (1 - dow + 7) % 7;
  if (add === 0 && d.getTime() <= from.getTime()) add = 7;
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Bounded-concurrency shard runner (same pattern as enrichShard). */
export async function pitchbookShard(slugs: string[], concurrency = 2): Promise<{ started_at: string; finished_at: string; results: { slug: string; investors: number; total_reported: number | null; note: string | null; errors: string[]; ms: number }[] }> {
  const { db } = await getDb(); const started_at = nowIso();
  const rows = slugs.map((s) => db.select().from(schema.companies).where(eq(schema.companies.slug, s)).get()).filter((r): r is NonNullable<typeof r> => !!r && r.bCapitalRole !== "firm");
  const results: { slug: string; investors: number; total_reported: number | null; note: string | null; errors: string[]; ms: number }[] = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, rows.length)) }, async () => { for (;;) { const idx = i++; if (idx >= rows.length) return; const row = rows[idx]; const t0 = Date.now(); const r = await fetchPitchbook(row); results.push({ slug: row.slug, investors: r.investors.matched.length, total_reported: r.investors.total_reported, note: r.provenance.note ?? null, errors: r.provenance.errors ?? [], ms: Date.now() - t0 }); } }));
  return { started_at, finished_at: nowIso(), results };
}
