import { test as base, expect, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { primeSettings, isAllowed } from "./helpers";

/**
 * routes-clean (turn 4, unit 4b) — /overview /companies /news /chat /artifacts /settings at 1440×900 and 390×844:
 * goto(route + "?skip=1") → networkidle (20 s cap, falls back to domcontentloaded) → main document HTTP 200 → zero console errors and zero
 * pageerrors after the same noise filter as helpers.ts `captureErrors` (favicon / net::ERR_ABORTED / ERR_BLOCKED_BY_ORB / 404 resources) plus
 * sourcemap + aborted `_rsc` fetch noise. Results → proof/evidence/routes-clean.json [{route, viewport, status, consoleErrors, pageErrors}].
 */
const ROUTES = ["/overview", "/companies", "/news", "/chat", "/artifacts", "/settings"] as const;
const OUT = path.resolve(__dirname, "../proof/evidence");
const JSON_OUT = path.join(OUT, "routes-clean.json");
fs.mkdirSync(OUT, { recursive: true });
const EXTRA_ALLOW = [/\.map\b/i, /sourcemap/i, /_rsc=/i, /ResizeObserver loop/i];
const allowed = (m: string) => isAllowed(m) || EXTRA_ALLOW.some((re) => re.test(m));
const iso = () => new Date().toISOString();
const vpTag = (page: Page) => { const v = page.viewportSize(); return `${v?.width ?? 1440}x${v?.height ?? 900}`; };

type Row = { at: string; route: string; viewport: string; status: number | null; consoleErrors: string[]; pageErrors: string[]; settled: "networkidle" | "domcontentloaded"; ms: number };
const rows: Row[] = [];
function flush() {
  let prev: Row[] = [];
  try { prev = JSON.parse(fs.readFileSync(JSON_OUT, "utf8")) as Row[]; } catch { prev = []; }
  // keep rows from the other project of this run (same process); drop stale rows for (route, viewport) pairs we re-measured
  const keep = prev.filter((p) => !rows.some((r) => r.route === p.route && r.viewport === p.viewport));
  fs.writeFileSync(JSON_OUT, JSON.stringify([...keep, ...rows], null, 2));
}

const test = base.extend<{ prime: void }>({
  prime: [async ({ page }, use) => { await primeSettings(page); await use(); }, { auto: true }],
});

for (const route of ROUTES) {
  test(`${route} → 200, 0 console errors, 0 page errors`, async ({ page }, ti: TestInfo) => {
    test.setTimeout(90_000);
    const consoleErrors: string[] = []; const pageErrors: string[] = [];
    page.on("pageerror", (e) => { const m = "pageerror: " + e.message; if (!allowed(m)) pageErrors.push(m); });
    page.on("console", (m) => { if (m.type() !== "error") return; const t = "console: " + m.text().slice(0, 300); if (!allowed(t)) consoleErrors.push(t); });
    const t0 = Date.now();
    const res = await page.goto(route + "?skip=1", { waitUntil: "domcontentloaded", timeout: 60_000 });
    const status = res?.status() ?? null;
    let settled: Row["settled"] = "networkidle";
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => { settled = "domcontentloaded"; });
    await page.waitForTimeout(500); // let late console errors land
    const row: Row = { at: iso(), route, viewport: vpTag(page), status, consoleErrors, pageErrors, settled, ms: Date.now() - t0 };
    rows.push(row); flush();
    console.log(`[${row.at}] [${ti.project.name}] ${route} ${row.viewport} status=${status} settled=${settled} console=${consoleErrors.length} page=${pageErrors.length} ${row.ms}ms`);
    await page.screenshot({ path: ti.outputPath(`route${route.replace(/\//g, "-")}-${row.viewport}.png`) }).catch(() => undefined);
    if (consoleErrors.length || pageErrors.length) ti.annotations.push({ type: "client-errors", description: [...consoleErrors, ...pageErrors].slice(0, 10).join(" | ") });
    expect(status, `${route} main document HTTP status`).toBe(200);
    expect(consoleErrors, `${route} console errors at ${row.viewport}`).toEqual([]);
    expect(pageErrors, `${route} page errors at ${row.viewport}`).toEqual([]);
  });
}

test.afterAll(() => { flush(); console.log(`[${iso()}] routes-clean rows=${rows.length} → ${JSON_OUT}`); });
