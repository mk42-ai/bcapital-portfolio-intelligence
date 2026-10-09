import { migrate } from "drizzle-orm/sql-js/migrator";
import { getDb, persist, DB_PATH } from "../src/db/client.js";

const { db } = await getDb();
await migrate(db, { migrationsFolder: "./drizzle" });
persist();
console.log(JSON.stringify({ ok: true, db: DB_PATH, migrated_at: new Date().toISOString() }));
