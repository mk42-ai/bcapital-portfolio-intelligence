import { NextRequest } from "next/server";
import { getClip } from "@/lib/voice/clip-store";

/** GET /api/voice/clip/[token] — serves a parked voice clip (public bytes, 10-minute TTL) so OnDemand speech_to_text can fetch it by URL. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const clip = /^[a-z0-9]{20,80}$/i.test(token) ? getClip(token) : null;
  if (!clip) return new Response("clip not found or expired", { status: 404, headers: { "cache-control": "no-store" } });
  const body = new Uint8Array(clip.bytes); // fresh copy → a plain ArrayBuffer-backed BodyInit
  return new Response(body, { status: 200, headers: { "content-type": clip.type, "content-length": String(body.byteLength), "cache-control": "private, max-age=600", "accept-ranges": "none", "x-robots-tag": "noindex" } });
}

export async function HEAD(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const r = await GET(req, ctx);
  return new Response(null, { status: r.status, headers: r.headers });
}
