import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { config } from "./config.js";
import { getDb } from "./db/client.js";

await getDb(); // warm the DB before accepting traffic
serve({ fetch: app.fetch, port: config.port, hostname: "0.0.0.0" }, (info) => {
  console.log(JSON.stringify({ msg: "listening", port: info.port, basePath: config.basePath || "/", startedAt: new Date().toISOString(), ingestSecretConfigured: Boolean(config.ingestSecret) }));
});
