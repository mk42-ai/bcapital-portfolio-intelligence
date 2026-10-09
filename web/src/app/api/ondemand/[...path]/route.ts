import { NextRequest } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Server-side proxy to the OnDemand public REST API (pattern from falkoneye-ondemand-integration-architecture §7 / ONDEMAND_API_CONTRACTS).
 * The caller supplies its own key in `x-ondemand-key`; we forward it as `apikey`. Nothing is persisted, logged or cached.
 * Allow-list: only the documented Chat API paths (sessions, query, messages) and the plugin list are proxied.
 */
const BASE = (process.env.ONDEMAND_BASE_URL ?? "https://api.on-demand.io").replace(/\/$/, "");
const ALLOW = [/^chat\/v1\/sessions(\/[A-Za-z0-9]+(\/(query|messages)(\/[A-Za-z0-9]+)?)?)?$/, /^plugin\/v1\/list$/];
const HOP = new Set(["host", "connection", "content-length", "x-ondemand-key", "cookie", "transfer-encoding"]);

async function proxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params; const rel = path.join("/");
  if (!ALLOW.some((re) => re.test(rel))) return Response.json({ message: `Path not allowed: ${rel}`, errorCode: "unauthorized" }, { status: 403 });
  const key = req.headers.get("x-ondemand-key")?.trim();
  if (!key) return Response.json({ message: "Missing x-ondemand-key header — add your OnDemand apikey in Settings (stored only in your browser).", errorCode: "unauthenticated" }, { status: 401 });
  const url = `${BASE}/${rel}${req.nextUrl.search}`;
  const headers = new Headers();
  req.headers.forEach((v, k) => { if (!HOP.has(k.toLowerCase())) headers.set(k, v); });
  headers.set("apikey", key);
  const init: RequestInit & { duplex?: "half" } = { method: req.method, headers, signal: req.signal, redirect: "manual" };
  if (!["GET", "HEAD"].includes(req.method)) { init.body = await req.text(); }
  let upstream: Response;
  try { upstream = await fetch(url, init); }
  catch (e) { const aborted = (e as Error).name === "AbortError"; return Response.json({ message: aborted ? "Request aborted by client" : `Upstream fetch failed: ${(e as Error).message}`, errorCode: aborted ? "aborted" : "bad_gateway" }, { status: aborted ? 499 : 502 }); }
  const out = new Headers();
  for (const h of ["content-type", "cache-control", "x-request-id"]) { const v = upstream.headers.get(h); if (v) out.set(h, v); }
  out.set("x-accel-buffering", "no"); out.set("x-proxied-by", "bcap-portfolio-intelligence");
  if ((upstream.headers.get("content-type") ?? "").includes("text/event-stream")) { out.set("cache-control", "no-cache, no-transform"); out.set("connection", "keep-alive"); }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
export { proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE };
