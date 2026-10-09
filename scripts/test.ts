// Minimal in-process test suite (no network): exercises every route through app.fetch.
process.env.NODE_ENV = "test"; process.env.INGEST_SECRET = "test-secret"; process.env.DB_READONLY = "1";
const { app } = await import("../src/app.js");
let failed = 0;
async function t(name: string, fn: () => Promise<void>) { try { await fn(); console.log("ok   -", name); } catch (e) { failed++; console.log("FAIL -", name, (e as Error).message); } }
const get = (p: string, init?: RequestInit) => app.request(`http://local${p}`, init);
const expect = (cond: boolean, msg: string) => { if (!cond) throw new Error(msg); };
await t("health returns 136 spec records", async () => { const r = await get("/health"); const j: any = await r.json(); expect(r.status === 200, "status"); expect(j.db_record_count === 136, `count=${j.db_record_count}`); });
await t("companies pagination + filter", async () => { const j: any = await (await get("/companies?sector=Healthcare&limit=5&page=2")).json(); expect(j.pagination.total === 38, "healthcare=38"); expect(j.data.length === 5, "page size"); });
await t("companies role filter validates", async () => { const r = await get("/companies?role=bogus"); expect(r.status === 400, "400"); });
await t("focus filter returns 5", async () => { const j: any = await (await get("/companies?focus=true")).json(); expect(j.pagination.total === 5, `focus=${j.pagination.total}`); });
await t("company by slug + name fallback", async () => { expect((await get("/companies/perplexity-ai")).status === 200, "slug"); expect((await get("/companies/WRITER")).status === 200, "name"); expect((await get("/companies/nope")).status === 404, "404"); });
await t("status changes applied", async () => { const j: any = await (await get("/companies/judi-rx")).json(); expect(/Judi Rx/.test(j.data.name), "judi"); const f: any = await (await get("/companies/fervo-energy")).json(); expect(/FRVO/.test(f.data.status), "frvo"); const m: any = await (await get("/companies/meesho")).json(); expect(/public/.test(m.data.status), "meesho"); const cm: any = await (await get("/companies/code-metal")).json(); expect(/unicorn/.test(cm.data.status), "code metal"); });
await t("every record has a flagged estimate rationale", async () => { const j: any = await (await get("/companies?limit=200")).json(); const bad = j.data.filter((c: any) => !c.estimate_rationale || (c.b_capital_role !== "firm" && !/^ESTIMATE:/.test(c.estimate_rationale) && c.estimate_confidence !== "high")); expect(bad.length === 0, `missing rationale: ${bad.map((b: any) => b.slug).join(",")}`); });
await t("news + sentiment + portfolio + search", async () => { expect((await get("/companies/fervo-energy/news")).status === 200, "news"); const s: any = await (await get("/companies/apptronik/sentiment")).json(); expect(typeof s.current.score === "number", "score"); const p: any = await (await get("/sentiment/portfolio")).json(); expect(p.portfolio.company_count === 136, "rollup count"); expect(p.sectors.length >= 4, "sectors"); const q: any = await (await get("/search?q=robot")).json(); expect(Array.isArray(q.companies), "search"); expect((await get("/search?q=a")).status === 400, "short q"); });
await t("openapi is 3.1 with all paths", async () => { const j: any = await (await get("/openapi.json")).json(); expect(j.openapi === "3.1.0", "version"); for (const p of ["/companies", "/companies/{slug}", "/companies/{slug}/news", "/companies/{slug}/sentiment", "/sentiment/portfolio", "/search", "/ingest", "/openapi.json", "/health"]) expect(!!j.paths[p], `missing ${p}`); });
await t("ingest requires secret", async () => { expect((await get("/ingest", { method: "POST", body: "{}" })).status === 401, "401"); });
await t("ingest accepts strict + llm-text payload and computes deltas", async () => {
  const r1 = await get("/ingest", { method: "POST", headers: { "X-Ingest-Secret": "test-secret", "content-type": "application/json" }, body: JSON.stringify({ workflow_name: "t", companies: [{ slug: "writer", sentiment: { score: 0.6, evidence: [{ url: "https://x", quote: "q" }] }, news: [{ title: "T1", url: "https://example.com/t1" }] }, { slug: "ghost" }] }) });
  const j1: any = await r1.json(); expect(r1.status === 200 && j1.companies_touched === 1 && j1.unmatched[0] === "ghost", JSON.stringify(j1));
  const r2 = await get("/ingest", { method: "POST", headers: { "X-Ingest-Secret": "test-secret" }, body: "Result:\n```json\n{\"companies\":[{\"slug\":\"writer\",\"sentiment\":{\"score\":0.2}}]}\n```" });
  expect(r2.status === 200, "llm text"); const s: any = await (await get("/companies/writer/sentiment")).json(); expect(Math.abs(s.delta - (-0.4)) < 1e-6, `delta=${s.delta}`);
  const r3 = await get("/ingest", { method: "POST", headers: { "X-Ingest-Secret": "test-secret" }, body: "no json here" }); expect(r3.status === 400, "400 on garbage");
});
console.log(failed ? `\n${failed} test(s) FAILED` : "\nall tests passed");
process.exit(failed ? 1 : 0);
