import { NextRequest } from "next/server";
export const runtime = "nodejs";
/** Same-origin pass-through to the portfolio backend (read-only GETs) so client components avoid CORS/mixed-origin issues; /ingest is NOT exposed. */
const BASE = (process.env.PORTFOLIO_API_URL ?? process.env.NEXT_PUBLIC_PORTFOLIO_API_URL ?? "https://sb-4wdkkmzv7w2z.vercel.run").replace(/\/$/, "");
export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params; const rel = path.join("/");
  if (rel.startsWith("ingest")) return Response.json({ message: "not exposed", errorCode: "unauthorized" }, { status: 403 });
  const override = req.headers.get("x-portfolio-base"); const base = override && /^https?:\/\//.test(override) ? override.replace(/\/$/, "") : BASE;
  try {
    const r = await fetch(`${base}/${rel}${req.nextUrl.search}`, { headers: { accept: "application/json" }, next: { revalidate: 60 } });
    return new Response(r.body, { status: r.status, headers: { "content-type": r.headers.get("content-type") ?? "application/json", "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch (e) { return Response.json({ message: `Backend unreachable: ${(e as Error).message}`, errorCode: "bad_gateway" }, { status: 502 }); }
}
