// Unit tests for src/scoring.ts — pure functions, no network, no DB. Run: npx tsx scripts/test-scoring.ts
import { decayWeight, wilsonLower, credibility, rawFactors, scorePortfolio, HALF_LIFE_DAYS, SHRINK_K, labelFor, type CompanyInput } from "../src/scoring.js";
let failed = 0;
const t = (name: string, fn: () => void) => { try { fn(); console.log("ok   -", name); } catch (e) { failed++; console.log("FAIL -", name, (e as Error).message); } };
const expect = (cond: boolean, msg: string) => { if (!cond) throw new Error(msg); };
const approx = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
const NOW = new Date("2026-10-10T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const co = (slug: string, sector: string, items: CompanyInput["items"], history: CompanyInput["history"] = []): CompanyInput => ({ slug, name: slug, sector, website: `https://${slug}.com`, items, history });

t("decay: half-life exactly 14 days", () => { expect(approx(decayWeight(0), 1), "t0"); expect(approx(decayWeight(HALF_LIFE_DAYS), 0.5), "half"); expect(approx(decayWeight(2 * HALF_LIFE_DAYS), 0.25), "quarter"); expect(decayWeight(-5) === 1, "future clamps to 1"); });
t("wilson lower bound: known values and monotonicity", () => { expect(approx(wilsonLower(0, 0), 0), "n=0"); expect(wilsonLower(10, 10) > 0.72 && wilsonLower(10, 10) < 0.73, `10/10 → ${wilsonLower(10, 10)}`); expect(wilsonLower(1, 1) < wilsonLower(10, 10), "more evidence → tighter"); expect(wilsonLower(5, 10) < 0.5, "5/10 below p"); });
t("credibility tiers", () => { expect(credibility("https://www.reuters.com/x").weight === 1, "reuters"); expect(credibility("https://x.com/a").weight === 0.5, "social"); expect(credibility("https://fervoenergy.com/news", "fervoenergy.com").tier === "company-owned", "owned"); expect(credibility("https://randomblog.io/p").weight === 0.7, "other"); expect(credibility(null).weight === 0.6, "none"); });
t("shrinkage: two thin items sit near the prior, many items converge to their mean", () => {
  const thin = rawFactors(co("thin", "Tech", [{ url: "https://a.com/1", published_at: daysAgo(1), sentiment: 1 }, { url: "https://a.com/2", published_at: daysAgo(2), sentiment: 1 }]), 0, NOW);
  expect(thin.level < 0.45, `thin level ${thin.level} should be pulled toward prior 0`);
  const many = rawFactors(co("many", "Tech", Array.from({ length: 40 }, (_, i) => ({ url: `https://reuters.com/${i}`, published_at: daysAgo(i % 5), sentiment: 1 }))), 0, NOW);
  expect(many.level > 0.9, `many level ${many.level} should approach 1`);
  expect(many.confidence > thin.confidence, "more evidence → more confidence");
});
t("recency: an old positive item moves the level less than a fresh one", () => {
  const fresh = rawFactors(co("f", "Tech", [{ url: "https://reuters.com/1", published_at: daysAgo(1), sentiment: 1 }]), 0, NOW);
  const old = rawFactors(co("o", "Tech", [{ url: "https://reuters.com/1", published_at: daysAgo(60), sentiment: 1 }]), 0, NOW);
  expect(fresh.level > old.level, `fresh ${fresh.level} > old ${old.level}`);
});
t("momentum: 7-day mean above 30-day mean is positive; reversed is negative", () => {
  const up = rawFactors(co("u", "Tech", [{ url: "https://reuters.com/1", published_at: daysAgo(2), sentiment: 0.8 }, { url: "https://reuters.com/2", published_at: daysAgo(20), sentiment: -0.6 }]), 0, NOW);
  const down = rawFactors(co("d", "Tech", [{ url: "https://reuters.com/1", published_at: daysAgo(2), sentiment: -0.8 }, { url: "https://reuters.com/2", published_at: daysAgo(20), sentiment: 0.6 }]), 0, NOW);
  expect(up.momentum > 0 && down.momentum < 0, `up ${up.momentum} down ${down.momentum}`);
});
t("undated / out-of-window items never contribute sentiment", () => {
  const r = rawFactors(co("x", "Tech", [{ url: "https://reuters.com/1", published_at: null, sentiment: 1 }, { url: "https://reuters.com/2", published_at: daysAgo(400), sentiment: 1 }]), 0, NOW);
  expect(approx(r.level, 0, 1e-9), `level ${r.level} must equal prior`); expect(r.details.evidence.dated_items === 1, "one dated");
});
t("portfolio: scores 0–100, percentiles span, labels consistent, factor contributions sum to composite", () => {
  const cos = [co("a", "Tech", [{ url: "https://reuters.com/1", published_at: daysAgo(1), sentiment: 0.9 }, { url: "https://reuters.com/2", published_at: daysAgo(3), sentiment: 0.7 }]), co("b", "Tech", [{ url: "https://reuters.com/3", published_at: daysAgo(1), sentiment: -0.9 }]), co("c", "Health", [], [{ score: 0.2, recorded_at: daysAgo(1) }, { score: -0.1, recorded_at: daysAgo(10) }]), co("d", "Health", [], []), co("e", "Health", [{ url: "https://x.com/1", published_at: daysAgo(2), sentiment: 0.5 }])];
  const out = scorePortfolio(cos, NOW);
  expect(out.length === 5, "5 scores");
  for (const s of out) { expect(s.score >= 0 && s.score <= 100, "range"); expect(s.confidence >= 0 && s.confidence <= 1, "conf"); expect(approx(Object.values(s.contributions).reduce((x, y) => x + y, 0), s.z.composite, 0.01), `contributions sum ${s.slug}`); expect(s.label === labelFor(s.score), "label"); }
  const a = out.find((s) => s.slug === "a")!, b = out.find((s) => s.slug === "b")!;
  expect(a.score > b.score, `a ${a.score} > b ${b.score}`); expect(a.percentile > b.percentile, "percentile order"); expect(a.top_sources.length === 2 && a.top_sources[0].url.startsWith("https://reuters.com"), "top sources");
});
t("determinism: same input → same output", () => { const cos = [co("a", "T", [{ url: "https://reuters.com/1", published_at: daysAgo(1), sentiment: 0.4 }]), co("b", "T", [])]; expect(JSON.stringify(scorePortfolio(cos, NOW)) === JSON.stringify(scorePortfolio(cos, NOW)), "deterministic"); });
t("empty portfolio", () => { expect(scorePortfolio([], NOW).length === 0, "empty"); });
console.log(failed ? `\n${failed} scoring test(s) FAILED` : `\nall scoring tests passed (K=${SHRINK_K})`);
process.exit(failed ? 1 : 0);
