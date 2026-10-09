/** Smoke-test every endpoint of a deployed instance. Usage: BASE_URL=https://… INGEST_SECRET=… tsx scripts/smoke.ts */
const base = (process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const secret = process.env.INGEST_SECRET ?? "";
const cases: [string, string, RequestInit?][] = [
  ["GET", "/health"], ["GET", "/companies?sector=Technology&limit=3"], ["GET", "/companies?region=Asia&role=unknown&page=2&limit=10"], ["GET", "/companies/perplexity-ai"], ["GET", "/companies/fervo-energy/news"],
  ["GET", "/companies/apptronik/sentiment"], ["GET", "/sentiment/portfolio"], ["GET", "/search?q=energy"], ["GET", "/openapi.json"],
  ["POST", "/ingest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ companies: [] }) }], // expect 401
  ["POST", "/ingest", { method: "POST", headers: { "content-type": "application/json", "X-Ingest-Secret": secret }, body: JSON.stringify({ workflow_name: "smoke", model: "smoke", companies: [{ slug: "b-capital", news: [{ title: "Smoke test ping", url: "https://b.capital/#smoke" }] }] }) }],
];
const out = [] as any[];
for (const [method, path, init] of cases) {
  const t0 = Date.now(); let status = 0; let note = "";
  try { const r = await fetch(base + path, init); status = r.status; const txt = await r.text(); note = txt.slice(0, 80).replace(/\s+/g, " "); } catch (e) { note = (e as Error).message; }
  out.push({ method, path, status, latency_ms: Date.now() - t0, timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), note });
}
console.log(JSON.stringify(out, null, 1));
