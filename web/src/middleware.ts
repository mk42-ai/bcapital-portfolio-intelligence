import { NextResponse, type NextRequest } from "next/server";
/**
 * Real HTTP 404 for unknown company slugs. With a root `loading.tsx` (Suspense) the page shell is flushed before `getCompany()` resolves,
 * so a `notFound()` thrown inside the page can only swap the body — the status is already 200. Deciding here, before any streaming,
 * lets Next serve its not-found page with a true 404 (we rewrite to a path that has no route). The check costs one short backend
 * GET per company page view; on backend trouble we fail open and let the page decide.
 */
const BASE = (process.env.PORTFOLIO_API_URL ?? process.env.NEXT_PUBLIC_PORTFOLIO_API_URL ?? "").replace(/\/$/, "");
export const config = { matcher: ["/company/:slug"] };
export async function middleware(req: NextRequest) {
  const slug = req.nextUrl.pathname.split("/")[2] ?? "";
  if (!BASE || !slug || !/^[a-z0-9][a-z0-9-]{0,80}$/.test(slug)) return NextResponse.next();
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch(`${BASE}/companies/${encodeURIComponent(slug)}`, { method: "GET", headers: { accept: "application/json" }, signal: ctl.signal });
    clearTimeout(t);
    if (r.status === 404) return NextResponse.rewrite(new URL(`/__not-found/company/${slug}`, req.url));
  } catch { /* fail open */ }
  return NextResponse.next();
}
