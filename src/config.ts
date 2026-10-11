/** Runtime configuration — every value comes from the environment; nothing secret is hard-coded. */
export const config = {
  port: Number(process.env.PORT ?? 3000),
  // e.g. /apps/bcap-portfolio-api on OnDemand serverless; on Vercel the public rewrite mounts this service at /backend (vercel.json).
  // Stripping is prefix-only, so unprefixed internal calls via the PORTFOLIO_API_URL binding still route.
  basePath: (process.env.BASE_PATH ?? (process.env.VERCEL ? "/backend" : "")).replace(/\/$/, ""),
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "", // absolute URL advertised in /openapi.json servers[]
  ingestSecret: process.env.INGEST_SECRET ?? "", // X-Ingest-Secret shared secret (generated at build, stored in env only)
  ondemandDefaultModel: process.env.ONDEMAND_DEFAULT_MODEL ?? "predefined-deepseek-flash", // DeepSeek Flash v4.1 (endpoint_name deepseek-v4.1-flash)
  ondemandApiKey: process.env.ONDEMAND_API_KEY ?? "", // header `apikey` for api.on-demand.io (media re-sign, workflow relay)
  ondemandBaseUrl: (process.env.ONDEMAND_BASE_URL ?? "https://api.on-demand.io").replace(/\/$/, ""),
  ondemandReasoningMode: process.env.ONDEMAND_REASONING_MODE ?? "medium",
  earliestTestUtc: process.env.EARLIEST_TEST_UTC ?? "",
  version: process.env.APP_VERSION ?? "1.0.0",
};
export const INGEST_SECRET_ENV_VAR = "INGEST_SECRET";
/** OnDemand `reasoningMode` sent with every refresh query (env ONDEMAND_REASONING_MODE, default "medium"). */
export const ONDEMAND_REASONING_MODE = config.ondemandReasoningMode;
/** Browser-like UA for every call to api.on-demand.io — Cloudflare error 1010 bans the default undici/node UA. */
export const ONDEMAND_USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 bcap-portfolio-intelligence/1.0";
