import type { Evidence, Mover } from "./db/schema.js";

export const LABELS = ["very negative", "negative", "neutral", "positive", "very positive"] as const;
export type Label = (typeof LABELS)[number];

export function labelFor(score: number): Label {
  if (score <= -0.6) return "very negative";
  if (score <= -0.2) return "negative";
  if (score < 0.2) return "neutral";
  if (score < 0.6) return "positive";
  return "very positive";
}

export function clampScore(x: unknown): number {
  const n = typeof x === "string" ? parseFloat(x) : Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-1, Math.min(1, +n.toFixed(4)));
}

export function normaliseEvidence(ev: unknown): Evidence[] {
  if (!Array.isArray(ev)) return [];
  return ev
    .map((e: any) => (typeof e === "string" ? { url: "", quote: e } : { url: String(e?.url ?? e?.link ?? ""), quote: String(e?.quote ?? e?.text ?? e?.snippet ?? ""), source: e?.source ? String(e.source) : undefined }))
    .filter((e) => e.quote || e.url)
    .slice(0, 20);
}

export function rollup(rows: { slug: string; name: string; score: number; delta: number | null }[]) {
  const n = rows.length;
  const avg = n ? rows.reduce((a, r) => a + r.score, 0) / n : 0;
  const movers: Mover[] = [...rows]
    .filter((r) => r.delta !== null)
    .sort((a, b) => Math.abs(b.delta!) - Math.abs(a.delta!))
    .slice(0, 5)
    .map((r) => ({ slug: r.slug, name: r.name, score: r.score, delta: +r.delta!.toFixed(4) }));
  return { companyCount: n, avgScore: +avg.toFixed(4), label: labelFor(avg), topMovers: movers };
}
