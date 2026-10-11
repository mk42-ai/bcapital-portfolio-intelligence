import { NextRequest } from "next/server";
import { artifactsBackend, ingestSecret, toArtifact } from "@/lib/artifacts/server";
import type { ArtifactWire } from "@/lib/artifacts/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "cache-control": "no-store" };
type Ctx = { params: Promise<{ id: string }> };
const validId = (id: string) => /^[A-Za-z0-9_-]{1,64}$/.test(id);

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!validId(id)) return Response.json({ code: "bad_request", message: "invalid id" }, { status: 400, headers: noStore });
  try {
    const r = await fetch(`${artifactsBackend()}/artifacts/${encodeURIComponent(id)}`, { headers: { accept: "application/json" }, cache: "no-store" });
    if (!r.ok) return new Response(await r.text() || "{}", { status: r.status, headers: { "content-type": "application/json", ...noStore } });
    const j = (await r.json()) as { data: ArtifactWire };
    return Response.json({ data: toArtifact(j.data) }, { headers: noStore });
  } catch (e) { return Response.json({ code: "bad_gateway", message: (e as Error).message }, { status: 502, headers: noStore }); }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!validId(id)) return Response.json({ code: "bad_request", message: "invalid id" }, { status: 400, headers: noStore });
  const secret = ingestSecret();
  if (!secret) return Response.json({ code: "no_ingest_secret", message: "INGEST_SECRET is not configured on the frontend server" }, { status: 503, headers: noStore });
  try {
    const r = await fetch(`${artifactsBackend()}/artifacts/${encodeURIComponent(id)}`, { method: "DELETE", headers: { accept: "application/json", "X-Ingest-Secret": secret }, cache: "no-store" });
    return new Response(await r.text() || "{}", { status: r.status, headers: { "content-type": r.headers.get("content-type") ?? "application/json", ...noStore } });
  } catch (e) { return Response.json({ code: "bad_gateway", message: (e as Error).message }, { status: 502, headers: noStore }); }
}
