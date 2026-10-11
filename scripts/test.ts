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
await t("pitchbook routes: list, slug, ingest validation, run fallback", async () => {
  const l: any = await (await get("/pitchbook")).json(); expect(Array.isArray(l.data) && typeof l.count === "number" && /^\d{4}-\d{2}-\d{2}T06:00:00Z$/.test(l.next_run_utc) && new Date(l.next_run_utc).getUTCDay() === 1, JSON.stringify(l).slice(0, 200));
  const g: any = await (await get("/pitchbook/writer")).json(); expect(g.company === "writer" && typeof g.enriched === "boolean" && !!g.next_run_utc, JSON.stringify(g).slice(0, 200)); expect((await get("/pitchbook/nope")).status === 404, "404");
  expect((await get("/pitchbook/ingest", { method: "POST", body: "{}" })).status === 401, "401"); expect((await get("/pitchbook/run", { method: "POST" })).status === 401, "run 401");
  const H = { "X-Ingest-Secret": "test-secret", "content-type": "application/json" };
  const bad = await get("/pitchbook/ingest", { method: "POST", headers: H, body: JSON.stringify({ records: [{ slug: "writer" }] }) }); const bj: any = await bad.json(); expect(bad.status === 400 && bj.rejected?.length === 1, JSON.stringify(bj));
  const ok = await get("/pitchbook/ingest", { method: "POST", headers: H, body: JSON.stringify({ execution_id: "ex-1", records: [{ slug: "writer", investors: { matched: [{ name: "Fund A", aum: "$1.5B", verticals: ["SaaS"] }], brief: "b", total_reported: 3 } }, { slug: "ghost", investors: { matched: [] } }] }) });
  const oj: any = await ok.json(); expect(ok.status === 200 && oj.status === "partial" && oj.written === 1 && oj.unmatched[0] === "ghost", JSON.stringify(oj));
  const g2: any = await (await get("/pitchbook/writer")).json(); expect(g2.enriched === true && g2.data.investors.matched[0].aum_musd === 1500 && g2.data.availability.investors === "VERIFIED" && g2.data.availability.financials === "NOT_AVAILABLE_FROM_PLUGIN" && g2.data.provenance.plugin_id === "plugin-1777018662", JSON.stringify(g2).slice(0, 300));
  const l2: any = await (await get("/pitchbook")).json(); expect(l2.data.some((r: any) => r.slug === "writer" && r.investors === 1), "listed");
  const trunc = await get("/pitchbook/ingest", { method: "POST", headers: H, body: '. {"workflow_name":"wf","records":[\n{"slug":"apptronik","investors":{"matched":[{"name":"Fund B","aum_musd":10}],"brief":"b","total_reported":5}},\n{"slug":"writer","investors":{"matched":[{"name":"Fund C","industries":["Softw' }); const tj: any = await trunc.json();
  expect(trunc.status === 200 && tj.written === 1 && tj.slugs[0] === "apptronik" && tj.salvaged?.truncated_records === 1, JSON.stringify(tj));
  const spec: any = await (await get("/openapi.json")).json(); for (const p of ["/pitchbook", "/pitchbook/{slug}", "/pitchbook/ingest", "/pitchbook/run"]) expect(!!spec.paths[p], `openapi missing ${p}`);
});
await t("artifacts: signed url never persisted; /signed-url falls back honestly", async () => {
  const H = { "X-Ingest-Secret": "test-secret", "content-type": "application/json" };
  const r = await get("/artifacts", { method: "POST", headers: H, body: JSON.stringify({ name: "t.txt", mime: "text/plain", content_base64: "aGk=", media_id: "abc", media_status: "stored", media_source_url: "https://x.blob.core.windows.net/c/y.pdf?se=2026-01-01T00%3A00%3A00Z&sig=zzz", media_plugins: ["plugin-1713962163"] }) });
  const j: any = await r.json(); expect(r.status === 201, `status ${r.status}`);
  expect(j.data.media_source_url === "https://x.blob.core.windows.net/c/y.pdf", `source url: ${j.data.media_source_url}`);
  expect(!/sig=|se=/.test(JSON.stringify(j.data)), "signature leaked"); expect(j.data.media_url_expires_at === "2026-01-01T00:00:00Z", `expires ${j.data.media_url_expires_at}`);
  expect(Array.isArray(j.data.media_plugins) && j.data.media_plugins[0] === "plugin-1713962163", "plugins");
  const g: any = await (await get(`/artifacts/${j.data.id}`)).json(); expect(g.data.media_source_url === "https://x.blob.core.windows.net/c/y.pdf", "persisted unsigned");
  const su = await get(`/artifacts/${j.data.id}/signed-url`); const sj: any = await su.json();
  expect(su.status === 200 && sj.data.source === "backend" && /\/artifacts\/art_[0-9a-f]+\/content$/.test(sj.data.url) && typeof sj.data.media_message === "string", JSON.stringify(sj));
  const spec: any = await (await get("/openapi.json")).json(); expect(!!spec.paths["/artifacts/{id}/signed-url"] && !!spec.components.schemas.Artifact.properties.media_source_url, "openapi");
  expect((await get("/artifacts/art_nope/signed-url")).status === 404, "404 unknown");
});
await t("artifacts: /versions lists every row sharing (name, thread_id), newest first", async () => {
  const H = { "X-Ingest-Secret": "test-secret", "content-type": "application/json" };
  const body = JSON.stringify({ name: "versions.txt", mime: "text/plain", content_base64: "aGk=", thread_id: "thr_versions" });
  const a: any = await (await get("/artifacts", { method: "POST", headers: H, body })).json(); const b: any = await (await get("/artifacts", { method: "POST", headers: H, body })).json();
  expect(a.data.version === 1 && b.data.version === 2, `versions ${a.data.version}/${b.data.version}`);
  const v: any = await (await get(`/artifacts/${a.data.id}/versions`)).json();
  expect(v.data.length === 2 && v.latest_version === 2 && v.data[0].id === b.data.id && v.data[0].version === 2 && v.data[1].id === a.data.id && v.name === "versions.txt" && v.thread_id === "thr_versions" && /\/content$/.test(v.data[0].content_url), JSON.stringify(v).slice(0, 300));
  const spec: any = await (await get("/openapi.json")).json(); expect(!!spec.paths["/artifacts/{id}/versions"] && !!spec.components.schemas.ArtifactVersion, "openapi versions");
  expect((await get("/artifacts/art_nope/versions")).status === 404, "404 unknown");
});
// ---- a42: reconciliation / sentiment runs / artifacts / headers / 404 shape ----
await t("news/summary: total equals Σ by_company and matches /health + /companies news_total", async () => {
  const j: any = await (await get("/news/summary")).json(); const sum = Object.values(j.by_company as Record<string, number>).reduce((a, b) => a + Number(b), 0);
  expect(Number.isInteger(j.total) && j.total > 0, `total=${j.total}`); expect(sum === j.total, `Σ by_company=${sum} total=${j.total}`);
  expect(Object.keys(j.by_company).length === j.companies, `companies=${j.companies} keys=${Object.keys(j.by_company).length}`);
  expect(j.raw_rows - j.dedup_removed - j.orphan_items === j.total, `raw ${j.raw_rows} - dedup ${j.dedup_removed} - orphans ${j.orphan_items} != total ${j.total}`);
  expect(j.reconciliation?.detail === "/news/reconciliation" && j.reconciliation.dedup_url === j.total, "reconciliation summary block");
  const h: any = await (await get("/health")).json(); expect(h.news_total === j.total, `health.news_total=${h.news_total}`);
  const c: any = await (await get("/companies?limit=1")).json(); expect(c.news_total === j.total, `companies.news_total=${c.news_total}`);
});
await t("news/reconciliation: orphans 0, dedup numbers consistent per row and in totals, as_of validated", async () => {
  const r: any = await (await get("/news/reconciliation")).json();
  expect(r.totals.orphan_rows === 0 && Array.isArray(r.totals.orphan_slugs) && r.totals.orphan_slugs.length === 0, `orphans=${r.totals.orphan_rows}`);
  const L = r.totals.listed_companies, A = r.totals.all_rows;
  expect(L.raw === A.raw - r.totals.orphan_rows, "listed raw = all raw - orphans");
  expect(L.dedup_url <= L.raw && L.dedup_title <= L.raw && L.summary_def <= L.raw && L.in_window_7d <= L.in_window_30d && L.in_window_30d <= L.raw && L.no_url <= L.raw, JSON.stringify(L));
  expect(r.news_summary_total === L.summary_def, `news_summary_total=${r.news_summary_total} summary_def=${L.summary_def}`);
  const s: any = await (await get("/news/summary")).json(); expect(s.total === r.news_summary_total, "same number as /news/summary");
  expect(Array.isArray(r.by_company) && r.by_company.length === r.companies, "by_company rows = companies");
  const sumDef = r.by_company.reduce((a: number, x: any) => a + x.summary_def, 0); expect(sumDef === L.summary_def, `Σ summary_def=${sumDef}`);
  const badRow = r.by_company.find((x: any) => x.dedup_url > x.raw || x.dedup_title > x.raw || x.summary_def > x.raw || x.in_window_7d > x.in_window_30d || x.orphan !== 0); expect(!badRow, `inconsistent row ${JSON.stringify(badRow)}`);
  expect(r.focus.length >= 5 && ["aimotive", "apptronik", "fervo-energy", "flutterwave", "writer"].every((s) => r.focus.some((x: any) => x.slug === s)), `focus rows ${r.focus.map((x: any) => x.slug).join(",")}`);
  expect(r.owner_figures?.focus_150?.seen === 150 && r.owner_figures.focus_150.seen_parts.apptronik === 33 && r.owner_figures.focus_150.seen_parts["fervo-energy"] === 37, "owner focus figures");
  const w: any = await (await get("/news/reconciliation?as_of=2026-01-01")).json(); expect(w.as_of === "2026-01-01", `as_of=${w.as_of}`);
  const bad: any = await (await get("/news/reconciliation?as_of=yesterday")).json(); expect(/^\d{4}-\d{2}-\d{2}$/.test(bad.as_of) && bad.as_of !== "yesterday", "garbage as_of falls back to today");
});
await t("sentiment/runs: null_delta 0 on the seed, counts coherent, newest first", async () => {
  const j: any = await (await get("/sentiment/runs")).json();
  expect(Array.isArray(j.data) && j.runs === j.data.length && j.runs >= 1, `runs=${j.runs}`);
  const latest = j.data[0]; expect(latest.null_delta === 0, `latest null_delta=${latest.null_delta}`);
  expect(j.companies_with_null_delta_now === 0, `companies_with_null_delta_now=${j.companies_with_null_delta_now}`);
  for (const r of j.data) { expect(r.companies <= r.sentiment_rows && r.moved + r.null_delta <= r.sentiment_rows && r.started_at <= r.finished_at, JSON.stringify(r)); expect(r.avg_score === null || (r.avg_score >= -1 && r.avg_score <= 1), "avg_score range"); }
  for (let i = 1; i < j.data.length; i++) expect(j.data[i - 1].started_at >= j.data[i].started_at, "ordered newest first");
});
await t("companies/:slug exposes sentiment.prior_run_at + scored_at consistent with sentiment/runs and /sentiment", async () => {
  const c: any = await (await get("/companies/writer")).json(); const s = c.data.sentiment;
  expect("scored_at" in s && "prior_run_at" in s && "prior_score" in s && "ingest_run_id" in s, Object.keys(s).join(","));
  expect(typeof s.scored_at === "string" && !Number.isNaN(Date.parse(s.scored_at)), `scored_at=${s.scored_at}`);
  expect(s.prior_run_at === null || (typeof s.prior_run_at === "string" && Date.parse(s.prior_run_at) <= Date.parse(s.scored_at)), `prior_run_at=${s.prior_run_at}`);
  const runs: any = await (await get("/sentiment/runs")).json(); expect(runs.data.some((r: any) => r.ingest_run_id === s.ingest_run_id), `ingest_run_id ${s.ingest_run_id} not a listed run`);
  const se: any = await (await get("/companies/writer/sentiment")).json(); expect(se.current.score === s.score, "score agrees with /sentiment");
  const spec: any = await (await get("/openapi.json")).json(); expect(!!spec.components.schemas.Sentiment.properties.prior_run_at && !!spec.components.schemas.Sentiment.properties.scored_at, "openapi Sentiment fields");
});
await t("artifacts: /versions, /signed-url, /:id, /content 404 on unknown with {errorCode,message} shape", async () => {
  for (const p of ["/artifacts/art_unknown/versions", "/artifacts/art_unknown/signed-url", "/artifacts/art_unknown", "/artifacts/art_unknown/content"]) {
    const r = await get(p); const j: any = await r.json(); expect(r.status === 404, `${p} status ${r.status}`); expect(j.errorCode === "not_found" && typeof j.message === "string" && j.message.length > 0, `${p} body ${JSON.stringify(j)}`);
  }
});
await t("artifacts: POST strips SAS tokens (sig/se/sp/sv/st/sr) from media_source_url, keeps safe query, rejects without secret", async () => {
  const H = { "X-Ingest-Secret": "test-secret", "content-type": "application/json" };
  const sas = "https://acc.blob.core.windows.net/c/doc.pdf?sp=r&st=2026-10-01T00%3A00%3A00Z&se=2026-10-12T00%3A00%3A00Z&sv=2024-11-04&sr=b&sig=AbC%2F123%3D";
  const r = await get("/artifacts", { method: "POST", headers: H, body: JSON.stringify({ name: "sas.pdf", mime: "application/pdf", content_base64: "aGk=", media_source_url: sas }) });
  const j: any = await r.json(); expect(r.status === 201, `status ${r.status}`);
  expect(j.data.media_source_url === "https://acc.blob.core.windows.net/c/doc.pdf", `stripped: ${j.data.media_source_url}`);
  expect(!/sig=|se=|sp=|sv=|sr=|st=/.test(JSON.stringify(j.data)), "SAS param leaked in response");
  expect(j.data.media_url_expires_at === "2026-10-12T00:00:00Z", `expires ${j.data.media_url_expires_at}`);
  const g: any = await (await get(`/artifacts/${j.data.id}`)).json(); expect(!/sig=/.test(JSON.stringify(g.data)), "SAS persisted");
  const list: any = await (await get("/artifacts?limit=100")).json(); expect(!/sig=AbC/.test(JSON.stringify(list)), "SAS leaked via list");
  const noSecret = await get("/artifacts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "x.txt", mime: "text/plain", content_base64: "aGk=" }) }); expect(noSecret.status === 401, `no secret → ${noSecret.status}`);
});
await t("CORS + X-Request-Id + X-Timestamp-Utc headers on every response (200, 404, OPTIONS)", async () => {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  for (const p of ["/health", "/companies/writer", "/nope"]) {
    const r = await get(p); expect(r.headers.get("access-control-allow-origin") === "*", `${p} CORS`); expect(uuid.test(r.headers.get("x-request-id") ?? ""), `${p} x-request-id=${r.headers.get("x-request-id")}`);
    expect(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(r.headers.get("x-timestamp-utc") ?? ""), `${p} x-timestamp-utc`);
  }
  const a = (await get("/health")).headers.get("x-request-id"), b = (await get("/health")).headers.get("x-request-id"); expect(a !== b, "request ids unique per request");
  const o = await get("/companies", { method: "OPTIONS", headers: { origin: "https://example.com", "access-control-request-method": "GET" } });
  expect(o.status === 204 && o.headers.get("access-control-allow-origin") === "*" && /GET/.test(o.headers.get("access-control-allow-methods") ?? ""), `preflight ${o.status}`);
});
await t("404 shape {errorCode,message} for unknown routes, unknown slugs, and /apps/<x> prefix rewrite", async () => {
  const r = await get("/definitely/not/here"); const j: any = await r.json();
  expect(r.status === 404 && j.errorCode === "not_found" && /Route not found: GET \/definitely\/not\/here/.test(j.message), JSON.stringify(j));
  expect(Object.keys(j).sort().join(",") === "errorCode,message", `extra keys: ${Object.keys(j).join(",")}`);
  const c = await get("/companies/no-such-company"); const cj: any = await c.json(); expect(c.status === 404 && cj.errorCode === "not_found" && typeof cj.message === "string", JSON.stringify(cj));
  const pb = await get("/pitchbook/no-such-company"); const pj: any = await pb.json(); expect(pb.status === 404 && pj.errorCode === "not_found", JSON.stringify(pj));
  const rw = await get("/apps/anything/health"); expect(rw.status === 200, `apps prefix rewrite ${rw.status}`);
  const rw404 = await get("/apps/anything/nope"); const rj: any = await rw404.json(); expect(rw404.status === 404 && rj.errorCode === "not_found", "rewrite keeps 404 shape");
});
console.log(failed ? `\n${failed} test(s) FAILED` : "\nall tests passed");
process.exit(failed ? 1 : 0);
