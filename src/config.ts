/** Runtime configuration — every value comes from the environment; nothing secret is hard-coded. */
export const config = {
  port: Number(process.env.PORT ?? 3000),
  basePath: (process.env.BASE_PATH ?? "").replace(/\/$/, ""), // e.g. /apps/bcap-portfolio-api on OnDemand serverless
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "", // absolute URL advertised in /openapi.json servers[]
  ingestSecret: process.env.INGEST_SECRET ?? "", // X-Ingest-Secret shared secret (generated at build, stored in env only)
  ondemandDefaultModel: process.env.ONDEMAND_DEFAULT_MODEL ?? "predefined-claude-fable-5.1",
  deferredPlugins: (process.env.DEFERRED_PLUGINS ?? "plugin-1777018662").split(",").map((s) => s.trim()).filter(Boolean),
  earliestTestUtc: process.env.EARLIEST_TEST_UTC ?? "",
  version: process.env.APP_VERSION ?? "1.0.0",
};
export const INGEST_SECRET_ENV_VAR = "INGEST_SECRET";
