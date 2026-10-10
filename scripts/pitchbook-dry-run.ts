// Live dry run of fetchPitchbook for one company (no DB write). Usage: ONDEMAND_API_KEY=… tsx scripts/pitchbook-dry-run.ts [slug]
process.env.DB_READONLY = "1"; process.env.NODE_ENV = "test";
const { fetchPitchbook } = await import("../src/pitchbook.js");
const { getDb, schema } = await import("../src/db/client.js");
const { eq } = await import("drizzle-orm");
const { db } = await getDb();
const row = db.select().from(schema.companies).where(eq(schema.companies.slug, process.argv[2] ?? "fervo-energy")).get()!;
const t0 = Date.now();
const r = await fetchPitchbook(row, { write: false });
const fs = await import("node:fs");
fs.writeFileSync("/tmp/wt-pb-be/proof/pitchbook/fervo-dry-run.json", JSON.stringify({ ...r, ms: Date.now() - t0 }, null, 2));
console.log(JSON.stringify({ ms: Date.now() - t0, session: r.provenance.session_id, note: r.provenance.note, calls: r.provenance.plugin_calls, matched: r.investors.matched.length, total: r.investors.total_reported, names: r.investors.matched.map((i) => i.name), availability: r.availability, errors: r.provenance.errors, brief: r.investors.brief }, null, 1));
