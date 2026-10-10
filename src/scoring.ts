/**
 * scoring.ts — evidence-weighted Signal Score (pure, deterministic, unit-tested; no I/O).
 *
 * Replaces the "fuel bar" gauge. Inputs are the facts the database already holds for a company: dated news items with an optional
 * per-item sentiment, the sentiment history (model-scored, −1…+1) and the portfolio/sector context. Output is a 0–100 score with a
 * confidence 0–1, a percentile rank, the factor contributions and the top contributing sources — everything the UI shows.
 *
 * Method (all constants are named and exported so the docs and tests speak the same numbers):
 *   1. Recency decay — every evidence item is weighted w = 0.5^(ageDays / HALF_LIFE_DAYS) (half-life 14 d) × source credibility.
 *   2. Sentiment level — the weighted mean of item sentiments (falls back to the latest model score when items carry none),
 *      SHRUNK toward the portfolio prior with a Bayesian pseudo-count: level = (Σw·s + K·prior) / (Σw + K), K = SHRINK_K.
 *      A company with two thin items therefore sits near the portfolio mean instead of swinging to ±1.
 *   3. Momentum — 7-day vs 30-day weighted sentiment means, clipped to ±1.
 *   4. Volume — log1p of the decayed news mass, so 1→2 items matters more than 20→21.
 *   5. Confidence — Wilson lower bound (z = 1.96) of the "positive share" among decayed items, scaled by how much evidence
 *      mass we have (saturating at VOLUME_SATURATION) — thin evidence ⇒ low confidence even when the mean looks strong.
 *   6. Composite z = Σ weight_f · z_f where each factor is z-scored within the portfolio AND within the sector (averaged);
 *      score = 50 + 15·z, clipped 0…100. Percentile = rank of the composite within the portfolio.
 */
export const HALF_LIFE_DAYS = 14;
export const SHRINK_K = 3; // pseudo-observations of the prior
export const VOLUME_SATURATION = 8; // decayed mass at which volume stops adding confidence
export const WILSON_Z = 1.96;
export const FACTOR_WEIGHTS = { level: 0.45, momentum: 0.25, volume: 0.15, confidence: 0.15 } as const;
export type FactorName = keyof typeof FACTOR_WEIGHTS;

/** Source credibility tiers (domain suffix match). Unknown domains get 0.7; social/UGC 0.5; company-owned press 0.8. */
export const CREDIBILITY: { test: RegExp; weight: number; tier: string }[] = [
  { test: /(reuters|bloomberg|ft\.com|wsj\.com|nytimes|economist|apnews|cnbc|forbes|techcrunch|theinformation|axios|businesswire|prnewswire|sec\.gov|nasdaq\.com)/i, weight: 1.0, tier: "tier-1 press / filings" },
  { test: /(technologyreview|wired|theverge|venturebeat|fortune|crunchbase|pitchbook|cbinsights|yahoo\.com|marketwatch|barrons|businessinsider|fastcompany)/i, weight: 0.9, tier: "tier-2 press / data" },
  { test: /(substack|medium\.com|reddit|x\.com|twitter|linkedin|instagram|tiktok|youtube)/i, weight: 0.5, tier: "social / UGC" },
];
export function credibility(url: string | null | undefined, companyDomain?: string | null): { weight: number; tier: string } {
  if (!url) return { weight: 0.6, tier: "undated / unknown" };
  let host = ""; try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { return { weight: 0.6, tier: "unknown" }; }
  if (companyDomain && host.endsWith(companyDomain.replace(/^www\./, ""))) return { weight: 0.8, tier: "company-owned" };
  for (const c of CREDIBILITY) if (c.test.test(host)) return { weight: c.weight, tier: c.tier };
  return { weight: 0.7, tier: "other press" };
}

export type EvidenceItem = { url?: string | null; title?: string; source?: string | null; published_at?: string | null; sentiment?: number | null; kind?: string | null };
export type SentimentPoint = { score: number; recorded_at: string };
export type CompanyInput = { slug: string; name: string; sector: string; website?: string | null; items: EvidenceItem[]; history: SentimentPoint[]; current?: number | null };
export type Factors = Record<FactorName, number>;
export type SignalScore = {
  slug: string; score: number; confidence: number; percentile: number; label: "strong" | "constructive" | "balanced" | "soft" | "weak";
  factors: Factors; z: Factors & { composite: number }; contributions: Factors; // contribution = weight × z (what moved the score)
  evidence: { items: number; decayed_mass: number; dated_items: number; window_days: number; positive_share: number; wilson_lower: number };
  momentum: { d7: number | null; d30: number | null; delta: number | null };
  top_sources: { title: string; url: string; source: string; published_at: string | null; weight: number; sentiment: number | null; tier: string }[];
  sparkline: { date: string; score: number }[]; sector: string; computed_at: string; method: string;
};

const DAY = 86_400_000;
const clip = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const r2 = (x: number) => Math.round(x * 100) / 100;
const r3 = (x: number) => Math.round(x * 1000) / 1000;
export function decayWeight(ageDays: number): number { return Math.pow(0.5, Math.max(0, ageDays) / HALF_LIFE_DAYS); }
export function wilsonLower(pos: number, n: number, z = WILSON_Z): number {
  if (n <= 0) return 0;
  const p = pos / n, z2 = z * z;
  const denom = 1 + z2 / n, centre = p + z2 / (2 * n), margin = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return clip((centre - margin) / denom, 0, 1);
}
function mean(xs: number[]): number { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }
function sd(xs: number[]): number { if (xs.length < 2) return 0; const m = mean(xs); return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)); }
function zscore(x: number, xs: number[]): number { const s = sd(xs); return s > 1e-9 ? clip((x - mean(xs)) / s, -3, 3) : 0; }

type Raw = { slug: string; sector: string; level: number; momentum: number; volume: number; confidence: number; details: Pick<SignalScore, "evidence" | "momentum" | "top_sources" | "sparkline"> };

/** Per-company raw factors (no cross-sectional normalisation yet). Exported for tests. */
export function rawFactors(c: CompanyInput, prior: number, now = new Date()): Raw {
  const t = now.getTime();
  let domain: string | null = null; try { domain = c.website ? new URL(c.website).hostname.replace(/^www\./, "") : null; } catch { domain = null; }
  const dated = c.items.map((it) => { const ts = it.published_at ? Date.parse(it.published_at) : NaN; return { it, age: Number.isFinite(ts) ? (t - ts) / DAY : null }; });
  const windowDays = 90;
  const scored = dated.filter((d) => d.age !== null && d.age >= -1 && d.age <= windowDays).map((d) => {
    const cred = credibility(d.it.url, domain); const w = decayWeight(d.age!) * cred.weight;
    const s = typeof d.it.sentiment === "number" && Number.isFinite(d.it.sentiment) ? clip(d.it.sentiment, -1, 1) : null;
    return { ...d, w, s, cred };
  });
  const undatedN = dated.length - dated.filter((d) => d.age !== null).length;
  const mass = scored.reduce((a, x) => a + x.w, 0) + undatedN * 0.15; // undated items count a little toward volume, never toward sentiment
  const withS = scored.filter((x) => x.s !== null);
  const latestModel = c.history.length ? c.history[0].score : typeof c.current === "number" ? c.current : null;
  // Level: weighted item sentiment when we have it; otherwise the latest model score weighted by the evidence mass (so an unscored
  // company with news still gets a model opinion, but one that is shrunk toward the prior like everyone else).
  const num = withS.length ? withS.reduce((a, x) => a + x.w * x.s!, 0) : latestModel !== null ? latestModel * Math.min(mass, 1) : 0;
  const den = withS.length ? withS.reduce((a, x) => a + x.w, 0) : latestModel !== null ? Math.min(mass, 1) : 0;
  const level = (num + SHRINK_K * prior) / (den + SHRINK_K);
  // Momentum: 7 d vs 30 d means (items first, history second).
  const win = (days: number) => { const xs = withS.filter((x) => x.age! <= days); if (xs.length) return xs.reduce((a, x) => a + x.w * x.s!, 0) / xs.reduce((a, x) => a + x.w, 0); const hs = c.history.filter((h) => (t - Date.parse(h.recorded_at)) / DAY <= days).map((h) => h.score); return hs.length ? mean(hs) : null; };
  const d7 = win(7), d30 = win(30);
  const momentum = d7 !== null && d30 !== null ? clip(d7 - d30, -1, 1) : c.history.length >= 2 ? clip(c.history[0].score - c.history[1].score, -1, 1) : 0;
  const volume = Math.log1p(mass);
  const posN = withS.filter((x) => x.s! > 0.1).length, negN = withS.filter((x) => x.s! < -0.1).length, nS = posN + negN + withS.filter((x) => Math.abs(x.s!) <= 0.1).length;
  const posShare = nS ? posN / nS : 0.5;
  const wl = nS ? wilsonLower(posN, nS) : 0;
  const confidence = clip((0.6 * (nS ? wl / Math.max(posShare, 1e-6) : 0) + 0.4) * Math.min(1, mass / VOLUME_SATURATION), 0, 1);
  const top = scored.filter((x) => x.it.url).sort((a, b) => b.w * (1 + Math.abs(b.s ?? 0)) - a.w * (1 + Math.abs(a.s ?? 0))).slice(0, 3)
    .map((x) => ({ title: String(x.it.title ?? x.it.url), url: String(x.it.url), source: String(x.it.source ?? ""), published_at: x.it.published_at ?? null, weight: r3(x.w), sentiment: x.s, tier: x.cred.tier }));
  const spark = c.history.slice(0, 30).map((h) => ({ date: h.recorded_at.slice(0, 10), score: r3(h.score) })).reverse();
  return { slug: c.slug, sector: c.sector, level, momentum, volume, confidence, details: { evidence: { items: c.items.length, decayed_mass: r3(mass), dated_items: dated.filter((d) => d.age !== null).length, window_days: windowDays, positive_share: r3(posShare), wilson_lower: r3(wl) }, momentum: { d7: d7 === null ? null : r3(d7), d30: d30 === null ? null : r3(d30), delta: r3(momentum) }, top_sources: top, sparkline: spark } };
}

export function labelFor(score: number): SignalScore["label"] { return score >= 70 ? "strong" : score >= 58 ? "constructive" : score >= 42 ? "balanced" : score >= 30 ? "soft" : "weak"; }

/** Scores the whole portfolio at once (cross-sectional z-scores need everyone). */
export function scorePortfolio(companies: CompanyInput[], now = new Date()): SignalScore[] {
  if (!companies.length) return [];
  // Portfolio prior = mean of the latest model scores (0 when nothing is scored yet).
  const latest = companies.map((c) => (c.history[0]?.score ?? c.current ?? 0));
  const prior = mean(latest);
  const raws = companies.map((c) => rawFactors(c, prior, now));
  const col = (f: FactorName, xs: Raw[]) => xs.map((r) => r[f]);
  const bySector = new Map<string, Raw[]>(); for (const r of raws) bySector.set(r.sector, [...(bySector.get(r.sector) ?? []), r]);
  const composites: number[] = [];
  const partial = raws.map((r) => {
    const sect = bySector.get(r.sector) ?? raws;
    const z = {} as Factors; const contributions = {} as Factors; let composite = 0;
    for (const f of Object.keys(FACTOR_WEIGHTS) as FactorName[]) {
      const zp = zscore(r[f], col(f, raws)); const zs = sect.length >= 3 ? zscore(r[f], col(f, sect)) : zp;
      z[f] = r3((zp + zs) / 2); contributions[f] = r3(FACTOR_WEIGHTS[f] * z[f]); composite += contributions[f];
    }
    composites.push(composite);
    return { r, z, contributions, composite };
  });
  const sorted = [...composites].sort((a, b) => a - b);
  const computed_at = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  return partial.map(({ r, z, contributions, composite }) => {
    const score = Math.round(clip(50 + 15 * composite, 0, 100));
    const below = sorted.filter((x) => x < composite).length, equal = sorted.filter((x) => x === composite).length;
    const percentile = Math.round(((below + equal / 2) / sorted.length) * 100);
    return { slug: r.slug, sector: r.sector, score, confidence: r2(r.confidence), percentile, label: labelFor(score), factors: { level: r3(r.level), momentum: r3(r.momentum), volume: r3(r.volume), confidence: r3(r.confidence) }, z: { ...z, composite: r3(composite) }, contributions, ...r.details, computed_at, method: `level(shrink K=${SHRINK_K}→prior ${r3(prior)}) 45% · momentum 7d−30d 25% · log volume 15% · Wilson confidence 15%; recency half-life ${HALF_LIFE_DAYS} d; z within portfolio+sector; score=50+15z` };
  });
}
