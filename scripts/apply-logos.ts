/**
 * Idempotent: reads proof/logo-resolution.json (written by scripts/resolve-logos.ts) and
 * UPDATEs companies.logo_url for every row with a verified chosen_url.
 *
 *   DB_PATH=/path/to/copy.sqlite node node_modules/tsx/dist/cli.mjs scripts/apply-logos.ts [proof/logo-resolution.json]
 *
 * Only rows whose logo_url actually differs are written; the firm record is never touched
 * (it is not present in the resolution file).
 */
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb, persist, nowIso, DB_PATH, schema } from "../src/db/client.js";

type Row = { slug: string; name: string; chosen_url: string | null; source: string };

const file = path.resolve(process.cwd(), process.argv[2] ?? "proof/logo-resolution.json");
const rows = JSON.parse(fs.readFileSync(file, "utf8")) as Row[];

const { db } = await getDb();
const existing = await db.select({ slug: schema.companies.slug, logoUrl: schema.companies.logoUrl }).from(schema.companies);
const current = new Map(existing.map((r) => [r.slug, r.logoUrl]));

let updated = 0;
let unchanged = 0;
let skipped = 0;
let unknown = 0;
for (const r of rows) {
  if (!r.chosen_url) {
    skipped++;
    continue;
  }
  if (!current.has(r.slug)) {
    unknown++;
    continue;
  }
  if (current.get(r.slug) === r.chosen_url) {
    unchanged++;
    continue;
  }
  await db.update(schema.companies).set({ logoUrl: r.chosen_url, updatedAt: nowIso() }).where(eq(schema.companies.slug, r.slug));
  updated++;
}
if (updated > 0) persist();

const withLogo = (await db.select({ logoUrl: schema.companies.logoUrl }).from(schema.companies)).filter((r) => !!r.logoUrl).length;
console.log(
  JSON.stringify({ ok: true, db: DB_PATH, source: path.relative(process.cwd(), file), rows: rows.length, updated, unchanged, skipped_no_url: skipped, unknown_slug: unknown, companies_with_logo: withLogo, companies_total: existing.length }),
);
