import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";
import { drizzle, type SQLJsDatabase } from "drizzle-orm/sql-js";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { get as blobGet, put as blobPut } from "@vercel/blob";
import { waitUntil } from "@vercel/functions";
import * as schema from "./schema.js";

/**
 * SQLite via sql.js (pure WASM — no native build step, so the same bundle runs in the
 * OnDemand serverless container, on Vercel functions and locally). The DB file is
 * loaded into memory at boot and flushed back to DB_PATH after every write.
 * Durability note: on serverless the file system is ephemeral; the baseline copy is
 * committed in the repo (data/portfolio.sqlite). On Vercel, connect a Blob store to keep
 * writes across cold starts (see loadFromBlob/scheduleBlobUpload below); otherwise every
 * workflow run re-POSTs its data to /ingest, so a cold start converges within one tick.
 */
// Kept as a static path.join(process.cwd(), …) so Vercel's file tracer bundles the committed DB into the function.
const BUNDLED_DB_PATH = path.join(process.cwd(), "data", "portfolio.sqlite");
export const DB_PATH = process.env.DB_PATH ?? BUNDLED_DB_PATH;

let sqlDb: SqlJsDatabase | null = null;
let orm: SQLJsDatabase<typeof schema> | null = null;

function wasmLocate(file: string): string {
  // Static path.join(process.cwd(), …) so Vercel's file tracer bundles the .wasm (a computed path is not traced);
  // fall back to module resolution when cwd is not the package root (e.g. scripts run from elsewhere).
  const bundled = path.join(process.cwd(), "node_modules", "sql.js", "dist", "sql-wasm.wasm");
  if (file === "sql-wasm.wasm" && fs.existsSync(bundled)) return bundled;
  const require = createRequire(import.meta.url);
  return path.join(path.dirname(require.resolve("sql.js")), file);
}

/** Optional Vercel Blob persistence: when a Blob store is connected (BLOB_READ_WRITE_TOKEN), the DB is loaded from a private blob at
 *  cold start and re-uploaded after writes, so ingest/refresh/artifact writes survive serverless restarts. Last writer wins across
 *  concurrent instances. Without a token this is a no-op and the bundled/local file is the only copy. */
const BLOB_DB_PATHNAME = process.env.BLOB_DB_PATHNAME ?? "db/portfolio.sqlite";
const blobEnabled = (): boolean => Boolean(process.env.BLOB_READ_WRITE_TOKEN) && process.env.DB_READONLY !== "1";

async function loadFromBlob(): Promise<Uint8Array | null> {
  if (!blobEnabled()) return null;
  try {
    const r = await blobGet(BLOB_DB_PATHNAME, { access: "private", useCache: false });
    if (!r?.stream) return null;
    return new Uint8Array(await new Response(r.stream).arrayBuffer());
  } catch (err) {
    console.warn(`[db] blob load failed, using bundled DB: ${(err as Error).message}`);
    return null;
  }
}

let uploading: Promise<void> | null = null;
let dirty = false;
function scheduleBlobUpload(): void {
  dirty = true;
  if (uploading) return; // the in-flight loop picks up the newest state
  uploading = (async () => {
    while (dirty && sqlDb) {
      dirty = false;
      await blobPut(BLOB_DB_PATHNAME, Buffer.from(sqlDb.export()), { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/vnd.sqlite3" });
    }
  })()
    .catch((err) => console.error(`[db] blob persist failed: ${(err as Error).message}`))
    .finally(() => { uploading = null; });
  // Keep the function alive until the upload finishes (no-op outside Vercel).
  waitUntil(uploading);
}

let opening: Promise<{ db: SQLJsDatabase<typeof schema>; raw: SqlJsDatabase }> | null = null;
export async function getDb(): Promise<{ db: SQLJsDatabase<typeof schema>; raw: SqlJsDatabase }> {
  if (orm && sqlDb) return { db: orm, raw: sqlDb };
  return (opening ??= (async () => {
    const SQL = await initSqlJs({ locateFile: wasmLocate });
    const fromBlob = await loadFromBlob();
    const db = fromBlob ? new SQL.Database(fromBlob) : fs.existsSync(DB_PATH) ? new SQL.Database(fs.readFileSync(DB_PATH)) : new SQL.Database();
    for (const ddl of schema.ARTIFACTS_DDL) { // boot-time migration for existing DB files (ADD COLUMN is not idempotent in SQLite)
      try { db.run(ddl); } catch (e) { if (!/duplicate column/i.test(String((e as Error)?.message ?? e))) throw e; }
    }
    sqlDb = db;
    orm = drizzle(db, { schema });
    console.log(JSON.stringify({ msg: "db.open", source: fromBlob ? "blob" : "file", bytes: fromBlob?.byteLength ?? null }));
    return { db: orm, raw: sqlDb };
  })().finally(() => { opening = null; }));
}

export function persist(): void {
  if (!sqlDb) return;
  if (process.env.DB_READONLY === "1") return;
  if (blobEnabled()) scheduleBlobUpload();
  if (process.env.VERCEL) return; // read-only deployment FS — Blob (above) is the durable copy there
  try {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, Buffer.from(sqlDb.export()));
  } catch (err) {
    // Read-only FS — keep the in-memory copy.
    console.warn(`[db] persist skipped: ${(err as Error).message}`);
  }
}

export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export { schema };
