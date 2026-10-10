import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { config } from "./config.js";
import { getDb } from "./db/client.js";
import { refreshCompanies, setNextScheduledAt } from "./refresh.js";

await getDb(); // warm the DB before accepting traffic
serve({ fetch: app.fetch, port: config.port, hostname: "0.0.0.0" }, (info) => {
  console.log(JSON.stringify({ msg: "listening", port: info.port, basePath: config.basePath || "/", startedAt: new Date().toISOString(), ingestSecretConfigured: Boolean(config.ingestSecret) }));
});

// Hourly in-process refresh: the 40 stalest companies (companies.updated_at asc) per tick, so the whole portfolio
// cycles every ~3–4 h. Disabled with REFRESH_CRON_MINUTES=0 or when ONDEMAND_API_KEY is absent.
const refreshMinutes = Number(process.env.REFRESH_CRON_MINUTES ?? 60);
if (refreshMinutes > 0 && process.env.ONDEMAND_API_KEY) {
  const everyMs = refreshMinutes * 60_000;
  const schedule = () => setNextScheduledAt(new Date(Date.now() + everyMs).toISOString().replace(/\.\d{3}Z$/, "Z"));
  schedule();
  const timer = setInterval(async () => {
    schedule();
    try {
      const r = await refreshCompanies({ limit: 40 });
      console.log(JSON.stringify({ msg: "refresh.tick", run: r.ingest_run_id, status: r.status, companies: r.companies_touched, news: r.news_upserted, with_images: r.with_images, errors: r.errors.length }));
    } catch (e) {
      console.error(JSON.stringify({ msg: "refresh.tick.error", error: (e as Error).message }));
    }
  }, everyMs);
  timer.unref();
  console.log(JSON.stringify({ msg: "refresh.scheduler", intervalMinutes: refreshMinutes, batchLimit: 40 }));
} else {
  console.log(JSON.stringify({ msg: "refresh.scheduler.disabled", reason: refreshMinutes > 0 ? "ONDEMAND_API_KEY not set" : "REFRESH_CRON_MINUTES=0" }));
}
