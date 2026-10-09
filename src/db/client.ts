import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";
import { drizzle, type SQLJsDatabase } from "drizzle-orm/sql-js";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import * as schema from "./schema.js";

/**
 * SQLite via sql.js (pure WASM — no native build step, so the same bundle runs in the
 * OnDemand serverless container, on Vercel functions and locally). The DB file is
 * loaded into memory at boot and flushed back to DB_PATH after every write.
 * Durability note: on serverless the file system is ephemeral; the authoritative copy
 * is committed in the repo (data/portfolio.sqlite) and every workflow run re-POSTs its
 * data to /ingest, so a cold start converges within one schedule tick.
 */
export const DB_PATH = process.env.DB_PATH ?? path.resolve(process.cwd(), "data/portfolio.sqlite");

let sqlDb: SqlJsDatabase | null = null;
let orm: SQLJsDatabase<typeof schema> | null = null;

function wasmLocate(file: string): string {
  // sql.js has an "exports" map without ./package.json, so resolve the main entry and walk to dist/.
  const require = createRequire(import.meta.url);
  const main = require.resolve("sql.js"); // .../sql.js/dist/sql-wasm.js
  return path.join(path.dirname(main), file);
}

export async function getDb(): Promise<{ db: SQLJsDatabase<typeof schema>; raw: SqlJsDatabase }> {
  if (orm && sqlDb) return { db: orm, raw: sqlDb };
  const SQL = await initSqlJs({ locateFile: wasmLocate });
  sqlDb = fs.existsSync(DB_PATH) ? new SQL.Database(fs.readFileSync(DB_PATH)) : new SQL.Database();
  orm = drizzle(sqlDb, { schema });
  return { db: orm, raw: sqlDb };
}

export function persist(): void {
  if (!sqlDb) return;
  if (process.env.DB_READONLY === "1") return;
  try {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, Buffer.from(sqlDb.export()));
  } catch (err) {
    // Read-only FS (e.g. Vercel) — keep the in-memory copy; log once.
    console.warn(`[db] persist skipped: ${(err as Error).message}`);
  }
}

export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export { schema };
