import "server-only";
/**
 * Server-side OnDemand configuration (read once; never shipped to the client bundle). The fixed model / plugin / deadline settings shared
 * with the browser live in ./config-public and are re-exported here, so server code keeps importing everything from "@/lib/ondemand/config".
 */
export * from "./config-public";
export const ONDEMAND_BASE_URL = (process.env.ONDEMAND_BASE_URL ?? "https://api.on-demand.io").replace(/\/$/, "");
export const serverApiKey = () => process.env.ONDEMAND_API_KEY?.trim() || "";
/** Cloudflare in front of api.on-demand.io returns 403 error 1010 ("browser_signature_banned") for bare/default user agents. */
export const UPSTREAM_USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 bcap-portfolio-intelligence/1.0";
/** /api/chat header fast-path budget (ms) for the x-ondemand-session response header. Default 0: the stream is returned immediately (first client
 *  event < 400 ms) and the sessionId is delivered in-stream via CUSTOM ondemand.session; set ONDEMAND_SESSION_HEADER_WAIT_MS to re-enable the race. */
export const CHAT_SESSION_HEADER_WAIT_MS = Math.max(0, Number(process.env.ONDEMAND_SESSION_HEADER_WAIT_MS) || 0);
/** Payload audit (default ON): /api/chat appends {request (key redacted), first 10 raw upstream events} per turn to <cwd>/proof/chat-payload-audit.json. */
export const PAYLOAD_AUDIT = process.env.ONDEMAND_PAYLOAD_AUDIT !== "0";
