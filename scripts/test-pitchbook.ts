// Unit tests for src/pitchbook.ts — parser on the REAL fulfillment answer of session 6aca399995268adc215e0bf1 (fixture copied verbatim), brief builder, helpers.
process.env.NODE_ENV = "test"; process.env.DB_READONLY = "1";
import fs from "node:fs";
import path from "node:path";
const { salvageRecords, parseInvestorAnswer, parseTotalReported, buildInvestorBrief, nextMondayUtc, normaliseIncomingRecord, emptyRecord, applyEnrichment, PITCHBOOK_PLUGIN_ID } = await import("../src/pitchbook.js");
let failed = 0, passed = 0;
const expect = (cond: boolean, msg: string) => { if (!cond) throw new Error(msg); };
async function t(name: string, fn: () => Promise<void> | void) { try { await fn(); passed++; console.log("ok   -", name); } catch (e) { failed++; console.log("FAIL -", name, (e as Error).message); } }

const fixture = fs.readFileSync(path.resolve("scripts/fixtures/pitchbook-fervo-answer.md"), "utf8");
const inv = parseInvestorAnswer(fixture);

await t("parser finds all 10 numbered investor blocks", () => { expect(inv.length === 10, `got ${inv.length}: ${inv.map((i) => i.name).join(", ")}`); });
await t("block 1 (NGP) — name/location/type/AUM/dry powder/founded/range/website", () => {
  const n = inv[0]; expect(n.name === "NGP Energy Capital Management", n.name); expect(n.location === "Dallas, TX", String(n.location)); expect(n.type === "PE/Buyout", String(n.type));
  expect(n.aum_musd === 10875, `aum=${n.aum_musd}`); expect(n.dry_powder_musd === 1514.4, `dp=${n.dry_powder_musd}`); expect(n.year_founded === 1988, `founded=${n.year_founded}`);
  expect(n.investment_range === "$20M–$500M", String(n.investment_range)); expect(n.website === "www.ngpenergy.com", String(n.website));
});
await t("deal types / verticals / preferences are split into arrays", () => {
  const n = inv[0]; expect(n.deal_types.length === 7 && n.deal_types[0] === "Buyout/LBO" && n.deal_types.includes("Seed Round"), JSON.stringify(n.deal_types));
  expect(n.verticals.join("|") === "AgTech|CleanTech|Climate Tech|Infrastructure|Oil & Gas", JSON.stringify(n.verticals));
  expect(n.preferences.length === 5 && n.preferences[0] === "Prefers majority stake", JSON.stringify(n.preferences));
});
await t("geographies parsed from the free-text 'across …' sentence (SCF Partners)", () => { const s = inv[1]; expect(s.name === "SCF Partners", s.name); expect(s.geographies.includes("Europe") && s.geographies.includes("North America"), JSON.stringify(s.geographies)); expect(s.year_founded === 1989, String(s.year_founded)); });
await t("'Verticals include …' (no colon) and 'Verticals: … | Website: …' same-line variants", () => { const w = inv.find((i) => i.name === "Warburg Pincus")!; expect(w.verticals.includes("CleanTech") && w.verticals.includes("Advanced Manufacturing"), JSON.stringify(w.verticals)); const a = inv.find((i) => i.name === "Advent International")!; expect(a.verticals.join("|") === "Impact Investing|Industrials" && a.website === "adventinternational.com", JSON.stringify([a.verticals, a.website])); });
await t("status flag on the header line (Cypress Group — Out of Business) + $4.6T AUM in millions", () => { const c = inv[9]; expect(c.name === "The Cypress Group" && c.status === "Out of Business" && c.location === "New York, NY" && c.type === "PE/Buyout", JSON.stringify(c)); const jp = inv.find((i) => i.name === "JP Morgan Asset Management")!; expect(jp.aum_musd === 4600000 && jp.dry_powder_musd === 8739.1, JSON.stringify([jp.aum_musd, jp.dry_powder_musd])); });
await t("total_reported = 106 from the live answer", () => { expect(parseTotalReported(fixture) === 106, String(parseTotalReported(fixture))); });
await t("parser is robust to garbage / empty input", () => { expect(parseInvestorAnswer("").length === 0, "empty"); expect(parseInvestorAnswer("no investors matched your criteria.").length === 0, "prose"); expect(parseInvestorAnswer("1) **Solo Fund** - Austin, TX (Venture Capital)\n  • AUM: $1.2B\n  • Website: https://solo.vc/").length === 1 && parseInvestorAnswer("1) **Solo Fund** - Austin, TX (Venture Capital)\n  • AUM: $1.2B")[0].aum_musd === 1200, "alt bullets"); });
await t("buildInvestorBrief emits the plugin's documented labels in order", () => {
  const b = buildInvestorBrief({ name: "Fervo Energy", sector: "Energy & Resilience", stage: "Series E", hq: "Houston, TX", region: "North America", description: "Enhanced geothermal systems developer", last_round_text: "Series E $500M", ticket_usd: 50_000_000 });
  const lines = b.split("\n"); expect(lines[0].startsWith("Stage: ") && lines[1].startsWith("Raise Size (USD): ") && lines[2].startsWith("Investor types: ") && lines[3].startsWith("Target geographies: ") && lines[4].startsWith("Ticket size range: ") && lines[lines.length - 1].startsWith("What the company does: "), b);
  expect(/Growth \/ Late Stage/.test(lines[0]) && /\$400M-\$750M/.test(lines[1]) && /Strategic energy/.test(lines[2]) && /North America/.test(lines[3]) && /\$25M-\$100M/.test(lines[4]) && /Fervo Energy — Enhanced geothermal/.test(lines[6]), b);
  const seed = buildInvestorBrief({ name: "X", sector: "Technology", stage: "Seed" }); expect(/Stage: Seed/.test(seed) && /\$5-25M/.test(seed) && /Target geographies: Global/.test(seed), seed);
});
await t("nextMondayUtc → next Monday 06:00 UTC (strictly after now)", () => {
  expect(nextMondayUtc(new Date("2026-10-10T13:00:00Z")) === "2026-10-12T06:00:00Z", nextMondayUtc(new Date("2026-10-10T13:00:00Z"))); // Sat → Mon
  expect(nextMondayUtc(new Date("2026-10-12T05:59:00Z")) === "2026-10-12T06:00:00Z", "Mon before 06:00");
  expect(nextMondayUtc(new Date("2026-10-12T06:00:00Z")) === "2026-10-19T06:00:00Z", "Mon at 06:00 → next week");
});
await t("normaliseIncomingRecord validates shape and coerces investors", () => {
  expect(!normaliseIncomingRecord({}, "2026-10-10T00:00:00Z").ok, "slug required"); expect(!normaliseIncomingRecord({ slug: "writer" }, "x").ok, "investors required"); expect(!normaliseIncomingRecord({ slug: "writer", investors: { matched: [{ aum: "$1B" }] } }, "x").ok, "name required");
  const r = normaliseIncomingRecord({ slug: "Writer", investors: { matched: [{ name: "Fund A", aum: "$1.5B", deal_types: "Seed Round, Early Stage VC" }], brief: "b", total_reported: "12" } }, "2026-10-10T00:00:00Z");
  expect(r.ok && r.record.slug === "writer" && r.record.investors.matched[0].aum_musd === 1500 && r.record.investors.matched[0].deal_types.length === 2 && r.record.investors.total_reported === 12 && r.record.availability.investors === "VERIFIED" && r.record.availability.overview === "NOT_AVAILABLE_FROM_PLUGIN" && r.record.provenance.plugin_id === PITCHBOOK_PLUGIN_ID, JSON.stringify(r));
});
await t("applyEnrichment back-fills overview/last_round as FROM_ENRICHMENT, never as PitchBook", () => {
  const rec = emptyRecord("fervo-energy", "brief", "2026-10-10T00:00:00Z");
  const profile: any = { description: { value: "Geothermal developer", source_url: "https://fervoenergy.com/about", published_date: null, fetched_at: "2026-10-09T00:00:00Z", plugin: "GPT Search" }, funding_rounds: [{ date: "2025-12-01", amount_usd: 500e6, amount_text: "$500M", round: "Series E", lead_investors: ["X"], source_url: "https://example.com/r", published_date: "2025-12-01", fetched_at: "2026-10-09T00:00:00Z", plugin: "Perplexity" }] };
  applyEnrichment(rec, profile);
  expect(rec.availability.overview === "FROM_ENRICHMENT" && rec.overview?.plugin_id === "GPT Search" && rec.availability.last_round === "FROM_ENRICHMENT" && (rec.last_round?.value as any).round === "Series E" && rec.availability.financials === "NOT_AVAILABLE_FROM_PLUGIN", JSON.stringify(rec));
  const none = applyEnrichment(emptyRecord("x", "b", "t"), null); expect(none.overview === null && none.availability.overview === "NOT_AVAILABLE_FROM_PLUGIN", "null profile");
});
await t("salvageRecords recovers every complete record from the REAL truncated workflow output (execution 6aca3d9d300de84fa7121262)", () => {
  const p = path.resolve("proof/pitchbook/workflow-exec-6aca3d9d-node-outputs.json"); if (!fs.existsSync(p)) return;
  const val: string = JSON.parse(fs.readFileSync(p, "utf8")).data.outputs["analyzer-0"].value;
  const s = salvageRecords(val); expect(!s.complete_json && s.records.length === 91 && s.truncated === 1 && s.records[0].slug === "apptronik" && s.records[0].investors.matched.length === 4 && s.workflow_name === "B Capital — PitchBook weekly enrichment", JSON.stringify({ n: s.records.length, t: s.truncated, c: s.complete_json }));
  const ok = salvageRecords('{"records":[{"slug":"a","investors":{"matched":[]}}]}'); expect(ok.complete_json && ok.records.length === 1, "valid json path");
});
console.log(failed ? `\n${passed} passed, ${failed} FAILED` : `\nall ${passed} pitchbook tests passed`);
process.exit(failed ? 1 : 0);
