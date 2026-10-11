/**
 * context-payload.test.ts — pure tests for web/src/lib/chat/context-payload.ts. Run with tsx (no framework):
 *   cd web && npm run test:context      (= node ../node_modules/tsx/dist/cli.mjs tests/unit/context-payload.test.ts)
 * Exits non-zero on any failure.
 */
import { buildContextPayload, isFirstRun, contextSummary, EMPTY_CONTEXT_SUMMARY, type ContextInputCompany } from "../../src/lib/chat/context-payload";

let pass = 0; const failures: string[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => { if (ok) { pass++; console.log(`  ok   ${name}`); } else { failures.push(name); console.log(`  FAIL ${name}${detail !== undefined ? ` → ${JSON.stringify(detail)}` : ""}`); } };
const eq = (name: string, got: unknown, want: unknown) => check(name, JSON.stringify(got) === JSON.stringify(want), { got, want });

const co = (slug: string, name: string, score: number, delta: number | null | undefined, extra: Partial<ContextInputCompany> = {}): ContextInputCompany => ({
  slug, name, sector: "AI", status: "active", stage: "Series B",
  sentiment: { score, label: score > 0.3 ? "positive" : "neutral", delta, updated_at: "2026-10-10T00:00:00Z", basis: "workflow" },
  news_count: 4, latest_news: [{ title: `${name} raises`, url: "https://x.test/a", published_at: "2026-10-09", source: "Reuters" }], estimated_ticket_size_usd: 1_000_000, ...extra,
});
const ALL = [
  co("aimotive", "AIMotive", 0.56, 0.69, { prior_run_at: "2026-10-03T00:00:00Z" }),
  co("apptronik", "Apptronik", 0.54, 0.42, { prior_run_at: "2026-10-03T00:00:00Z" }),
  co("fervo-energy", "Fervo Energy", 0.35, null),
  co("flutterwave", "Flutterwave", 0.44, 0.44),
  co("writer", "WRITER", 0.52, undefined),
  co("perplexity-ai", "Perplexity AI", 0.61, -0.25, { prior_run_at: "2026-10-03T00:00:00Z" }),
];

console.log("context-payload: add/remove sync");
{
  const p = buildContextPayload(ALL, ["aimotive", "apptronik", "fervo-energy", "flutterwave", "writer"], { fetchedAt: "2026-10-11T00:00:00Z" });
  eq("payload holds exactly the selected slugs in order", p.companies.map((c) => c.slug), ["aimotive", "apptronik", "fervo-energy", "flutterwave", "writer"]);
  check("removed company (Perplexity AI) is NOT in systemContext", !p.systemContext.includes("Perplexity AI"), p.systemContext.slice(0, 200));
  check("systemContext names every selected company", ["AIMotive", "Apptronik", "Fervo Energy", "Flutterwave", "WRITER"].every((n) => p.systemContext.includes(n)));
  eq("sessionContext keys mirror the selection", p.sessionContext.map((c) => c.key), ["company:aimotive", "company:apptronik", "company:fervo-energy", "company:flutterwave", "company:writer"]);
  eq("summary string", p.summary, "Context: 5 companies — AIMotive, Apptronik, Fervo Energy, Flutterwave, WRITER");
  const p2 = buildContextPayload(ALL, ["perplexity-ai", "apptronik"], { fetchedAt: "2026-10-11T00:00:00Z" });
  eq("re-selection reorders / swaps immediately (no stale set)", p2.companies.map((c) => c.name), ["Perplexity AI", "Apptronik"]);
  check("AIMotive absent after removal", !p2.systemContext.includes("AIMotive"));
  eq("unknown slug is skipped", buildContextPayload(ALL, ["nope", "writer"]).companies.map((c) => c.slug), ["writer"]);
  const empty = buildContextPayload(ALL, []);
  eq("empty selection → empty systemContext", empty.systemContext, "");
  eq("empty selection → summary tells the user where to pick", empty.summary, EMPTY_CONTEXT_SUMMARY);
  eq("summary singular", contextSummary(["WRITER"]), "Context: 1 company — WRITER");
}

console.log("context-payload: score vs delta");
{
  const p = buildContextPayload(ALL, ["aimotive", "fervo-energy", "flutterwave", "writer"], { fetchedAt: "2026-10-11T00:00:00Z" });
  const [aim, fervo, flw, wr] = p.companies;
  check("distinct field names present", "sentiment_score" in aim && "sentiment_delta_vs_prior_run" in aim && "sentiment_label" in aim && "prior_run_at" in aim && "news_count" in aim && "latest_headlines" in aim, Object.keys(aim));
  check("no legacy nested `sentiment` object in payload companies", !("sentiment" in aim));
  eq("score kept separate from delta", [aim.sentiment_score, aim.sentiment_delta_vs_prior_run], [0.56, 0.69]);
  eq("scored vs prior run keeps prior_run_at", [aim.run_status, aim.prior_run_at], ["scored vs prior run", "2026-10-03T00:00:00Z"]);
  eq("delta null → first run", [fervo.sentiment_delta_vs_prior_run, fervo.run_status, fervo.prior_run_at], [null, "first run", null]);
  eq("delta === score → first run (baseline 0)", [flw.sentiment_delta_vs_prior_run, flw.run_status], [null, "first run"]);
  eq("delta undefined → first run", [wr.sentiment_delta_vs_prior_run, wr.run_status], [null, "first run"]);
  check("isFirstRun helper agrees", isFirstRun(ALL[2]) && isFirstRun(ALL[3]) && !isFirstRun(ALL[0]));
  check("systemContext explains score vs delta", p.systemContext.includes("sentiment_score = current score in [-1,1]") && p.systemContext.includes("sentiment_delta_vs_prior_run = change since the previous scoring run") && p.systemContext.includes("never present deltas as the sentiment ranking"));
  check("systemContext line says 'first run' for Fervo", /Fervo Energy[^\n]*sentiment_delta_vs_prior_run: null \(first run\)/.test(p.systemContext));
  check("systemContext line carries +0.69 delta AND +0.56 score for AIMotive", /AIMotive[^\n]*sentiment_score: \+0\.56[^\n]*sentiment_delta_vs_prior_run: \+0\.69/.test(p.systemContext));
  check("systemContext ≤ 6000 chars", p.systemContext.length <= 6000);
  const sc = JSON.parse(p.sessionContext[0].value) as Record<string, unknown>;
  check("sessionContext value uses the distinct fields too", "sentiment_score" in sc && "sentiment_delta_vs_prior_run" in sc && !("sentiment" in sc), Object.keys(sc));
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((f) => `  - ${f}`).join("\n")); process.exit(1); }
