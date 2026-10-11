import { NextRequest } from "next/server";
import { artifactsBackend, ingestSecret, toArtifact } from "@/lib/artifacts/server";
import type { ArtifactWire } from "@/lib/artifacts/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "cache-control": "no-store" };

/** GET /api/artifacts?thread_id=&kind=&limit= → proxies backend GET /artifacts, maps to camelCase + same-origin content URLs. */
export async function GET(req: NextRequest) {
  const q = new URLSearchParams();
  for (const k of ["thread_id", "kind", "limit"]) { const v = req.nextUrl.searchParams.get(k); if (v) q.set(k, v.slice(0, 120)); }
  if (!q.has("limit")) q.set("limit", "200");
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 10000);
    const r = await fetch(`${artifactsBackend()}/artifacts?${q}`, { headers: { accept: "application/json" }, cache: "no-store", signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return Response.json({ code: "backend_error", message: `Backend ${r.status}`, data: [] }, { status: r.status === 404 ? 502 : r.status, headers: noStore });
    const j = (await r.json()) as { data?: ArtifactWire[]; total?: number; timestamp?: string };
    const data = (j.data ?? []).map(toArtifact);
    return Response.json({ data, total: j.total ?? data.length, timestamp: j.timestamp ?? new Date().toISOString() }, { headers: noStore });
  } catch (e) { return Response.json({ code: "bad_gateway", message: `Backend unreachable: ${(e as Error).message}`, data: [] }, { status: 502, headers: noStore }); }
}

/** POST /api/artifacts — multipart (file + fields) or JSON; relays to backend POST /artifacts adding X-Ingest-Secret (server-only). */
export async function POST(req: NextRequest) {
  const secret = ingestSecret();
  if (!secret) return Response.json({ code: "no_ingest_secret", message: "INGEST_SECRET is not configured on the frontend server" }, { status: 503, headers: noStore });
  const ct = req.headers.get("content-type") ?? "";
  let body: BodyInit; const headers: Record<string, string> = { accept: "application/json", "X-Ingest-Secret": secret };
  try {
    if (ct.includes("multipart/form-data")) {
      const fd = await req.formData();
      const file = fd.get("file");
      if (!(file instanceof Blob)) return Response.json({ code: "bad_request", message: "multipart body needs a 'file' field" }, { status: 400, headers: noStore });
      if (file.size > 25 * 1024 * 1024) return Response.json({ code: "too_large", message: "Max 25 MB per file" }, { status: 413, headers: noStore });
      const out = new FormData();
      for (const [k, v] of fd.entries()) out.append(k, v);
      if (!fd.get("source")) out.set("source", "upload");
      if (!fd.get("origin_event")) out.set("origin_event", "upload");
      body = out; // fetch sets the multipart boundary
    } else {
      const j = (await req.json()) as Record<string, unknown>;
      if (!j || typeof j.name !== "string") return Response.json({ code: "bad_request", message: "JSON body needs 'name'" }, { status: 400, headers: noStore });
      body = JSON.stringify(j); headers["content-type"] = "application/json";
    }
  } catch (e) { return Response.json({ code: "bad_request", message: (e as Error).message }, { status: 400, headers: noStore }); }
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 60000);
    const r = await fetch(`${artifactsBackend()}/artifacts`, { method: "POST", headers, body, cache: "no-store", signal: ctl.signal });
    clearTimeout(t);
    const text = await r.text();
    if (!r.ok) return new Response(text || "{}", { status: r.status, headers: { "content-type": r.headers.get("content-type") ?? "application/json", ...noStore } });
    const j = JSON.parse(text) as { data: ArtifactWire };
    return Response.json({ data: toArtifact(j.data) }, { status: 201, headers: noStore });
  } catch (e) { return Response.json({ code: "bad_gateway", message: `Backend unreachable: ${(e as Error).message}` }, { status: 502, headers: noStore }); }
}
