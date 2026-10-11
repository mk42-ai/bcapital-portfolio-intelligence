import { expect, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Lane G — shared helpers for e2e/qa-final.spec.ts. Everything is parameterised:
 *   QA_LABEL (default "baseline") → output dir web/proof/qa-final/<label>/
 *   BASE_URL                      → playwright baseURL (playwright.config.ts)
 */
export const LABEL = process.env.QA_LABEL ?? "baseline";
export const OUT = path.resolve(__dirname, "..", "proof", "qa-final", LABEL);
fs.mkdirSync(OUT, { recursive: true });
export const LOG = path.join(OUT, "qa-log.ndjson");
/** Same payload as e2e/helpers.ts primeSettings, but guarded: addInitScript also runs inside sandboxed/opaque frames (PDF preview iframe) where
 *  `localStorage` is null and an unguarded setItem surfaces as a pageerror that is NOT an app error. */
export async function primeSettingsSafe(page: Page, extra: Record<string, unknown> = {}) {
  const key = process.env.ONDEMAND_API_KEY ?? process.env.ON_DEMAND_API_KEY ?? "";
  await page.addInitScript(([k, v]) => { try { if (window.top === window && window.localStorage) localStorage.setItem(k as string, JSON.stringify(v)); } catch { /* opaque frame */ } },
    ["bcap.settings.v1", { onboarded: true, apikey: key, externalUserId: "INV-001", model: "predefined-deepseek-flash", theme: "light", companies: ["perplexity-ai", "apptronik", "fervo-energy", "flutterwave", "writer"], ...extra }]);
}
export const ROUTES = ["/overview", "/company/1au", "/news", "/chat", "/artifacts", "/settings"];

export function vpName(page: Page) {
  const v = page.viewportSize() ?? { width: 0, height: 0 };
  return `${v.width}x${v.height}`;
}

export function logger(ti: TestInfo, page: Page) {
  return (action: string, extra: Record<string, unknown> = {}) => {
    const line = { at: new Date().toISOString(), label: LABEL, project: ti.project.name, viewport: vpName(page), test: ti.title, action, ...extra };
    fs.appendFileSync(LOG, JSON.stringify(line) + "\n");
  };
}

/** Screenshot `<state>-<WxH>.png` into the label dir; logs an ISO-UTC line. Never throws. */
export async function shot(page: Page, ti: TestInfo, state: string, extra: Record<string, unknown> = {}) {
  const file = `${state}-${vpName(page)}.png`;
  const p = path.join(OUT, file);
  try {
    await page.screenshot({ path: p, fullPage: false, timeout: 15_000 });
    logger(ti, page)("screenshot", { state, file, ...extra });
    return file;
  } catch (e) {
    logger(ti, page)("screenshot-failed", { state, file, error: String((e as Error).message).slice(0, 200), ...extra });
    return null;
  }
}

/** Record a state that could not be captured (missing in baseline, no video, …). */
export function na(ti: TestInfo, page: Page, state: string, reason: string) {
  logger(ti, page)("screenshot-na", { state, file: null, reason });
}

/** Mirrors e2e/run-ux.spec.ts installProbes: CLS (non-input) with shift sources + long tasks. */
export async function installProbes(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __ux: { cls: number; longTasks: number; longMs: number; shifts: { v: number; t: number }[] }; __marks: { a: string; t: number }[] };
    w.__ux = { cls: 0, longTasks: 0, longMs: 0, shifts: [] }; w.__marks = [];
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!e.hadRecentInput) { w.__ux.cls += e.value; w.__ux.shifts.push({ v: e.value, t: Math.round(e.startTime) }); } }).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) { w.__ux.longTasks += 1; w.__ux.longMs += e.duration; } }).observe({ type: "longtask", buffered: true });
    } catch { /* unsupported */ }
    // First-seen timestamps per turn via MutationObserver (no polling latency): w.__first[testid] = ms since the last `w.__t0` reset.
    const ww = window as unknown as { __first: Record<string, number>; __t0: number | null };
    ww.__first = {}; ww.__t0 = null;
    const note = (el: Element) => {
      if (ww.__t0 == null) return; const id = el.getAttribute("data-testid"); if (!id) return;
      const ms = Math.round(performance.now() - ww.__t0);
      if (!(id in ww.__first)) ww.__first[id] = ms;
      const st = el.getAttribute("data-state"); if (st && !(`${id}:${st}` in ww.__first)) ww.__first[`${id}:${st}`] = ms;
      if (id === "answer-block" && !("answer-text" in ww.__first) && (el.textContent ?? "").trim().length > 0) ww.__first["answer-text"] = ms;
    };
    const scan = (n: Node) => { if (n.nodeType !== 1) { const p = (n as CharacterData).parentElement?.closest("[data-testid]"); if (p) note(p); return; } const e = n as Element; note(e); e.querySelectorAll("[data-testid]").forEach(note); };
    const start = () => new MutationObserver((muts) => { for (const m of muts) { if (m.type === "attributes") note(m.target as Element); else if (m.type === "characterData") scan(m.target); else m.addedNodes.forEach(scan); } }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-state"], characterData: true });
    if (document.documentElement) start(); else document.addEventListener("DOMContentLoaded", start, { once: true });
  });
}
/** Reset the in-page first-seen clock (call right before clicking send). */
export const resetFirstSeen = (page: Page) => page.evaluate(() => { const w = window as unknown as { __first: Record<string, number>; __t0: number }; w.__first = {}; w.__t0 = performance.now(); });
export const firstSeen = (page: Page) => page.evaluate(() => (window as unknown as { __first: Record<string, number> }).__first).catch(() => ({} as Record<string, number>));
export const mark = (page: Page, a: string) => page.evaluate((a) => { (window as unknown as { __marks: { a: string; t: number }[] }).__marks.push({ a, t: performance.now() }); }, a).catch(() => undefined);
/** CLS + long tasks of the window between marks `send:<id>` and `finish:<id>` (what the user watches while the run renders). */
export const uxWindow = (page: Page, id: string) => page.evaluate((id) => {
  const w = window as unknown as { __ux: { cls: number; longTasks: number; longMs: number; shifts: { v: number; t: number }[] }; __marks: { a: string; t: number }[] };
  const t0 = w.__marks.find((m) => m.a === `send:${id}`)?.t ?? 0; const t1 = w.__marks.find((m) => m.a === `finish:${id}`)?.t ?? Infinity;
  const streamCls = w.__ux.shifts.filter((x) => x.t >= t0 && x.t <= t1).reduce((a, x) => a + x.v, 0);
  return { streamCls: +streamCls.toFixed(4), pageCls: +w.__ux.cls.toFixed(4), longTasks: w.__ux.longTasks, longMs: Math.round(w.__ux.longMs) };
});

/**
 * Smoothness score /10 — IDENTICAL to e2e/run-ux.spec.ts `score()`:
 *   skeleton: first visible skeleton/thinking/working after send ≤1000 ms → 2, ≤2500 ms → 1, else 0
 *   cls:      stream-window CLS ≤0.05 → 2, ≤0.1 → 1, else 0
 *   jank:     long tasks ≤8 → 2, ≤20 → 1, else 0
 *   order:    Thinking → Working → Answer (→ Sources) DOM order → 2
 *   errors:   zero console/page errors → 1
 *   artifact: report artifact card rendered in the run → 1
 */
export const SCORE_FORMULA = "run-ux score(): skeleton(≤1000ms:2, ≤2500ms:1) + cls(≤0.05:2, ≤0.1:1) + jank(longTasks ≤8:2, ≤20:1) + order(thinking→working→answer→sources:2) + errors(0:1) + artifact(card present:1) = /10";
export function score(s: { firstSkeletonMs: number | null; cls: number; longTasks: number; errors: number; orderOk: boolean; artifactOk: boolean }) {
  const parts: Record<string, number> = {
    skeleton: s.firstSkeletonMs == null ? 0 : s.firstSkeletonMs <= 1000 ? 2 : s.firstSkeletonMs <= 2500 ? 1 : 0,
    cls: s.cls <= 0.05 ? 2 : s.cls <= 0.1 ? 1 : 0,
    jank: s.longTasks <= 8 ? 2 : s.longTasks <= 20 ? 1 : 0,
    order: s.orderOk ? 2 : 0,
    errors: s.errors === 0 ? 1 : 0,
    artifact: s.artifactOk ? 1 : 0,
  };
  return { total: Object.values(parts).reduce((a, b) => a + b, 0), parts };
}

/** Read-modify-write a JSON file keyed by viewport (desktop + mobile projects run sequentially with --workers=1). */
export function mergeJson(file: string, key: string, value: unknown, finalize?: (all: Record<string, unknown>) => Record<string, unknown>) {
  const p = path.join(OUT, file);
  let all: Record<string, unknown> = {};
  try { all = JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>; } catch { all = {}; }
  all[key] = value;
  if (finalize) all = finalize(all);
  fs.writeFileSync(p, JSON.stringify(all, null, 2));
}

/** Console + page errors on the current page (raw + "allowed-noise" filtered like e2e/helpers.ts). */
const ALLOW = [/favicon/i, /net::ERR_ABORTED/i, /ERR_BLOCKED_BY_ORB/i, /Failed to load resource.*404/i];
export function captureAll(page: Page) {
  const all: { kind: string; text: string }[] = [];
  page.on("pageerror", (e) => all.push({ kind: "pageerror", text: e.message.slice(0, 300) }));
  page.on("console", (m) => { if (m.type() === "error") all.push({ kind: "console", text: m.text().slice(0, 300) }); });
  return { all, real: () => all.filter((e) => !ALLOW.some((re) => re.test(e.text))) };
}

/** Wait until the current assistant turn has settled (answer present, no streaming marker), polling for first-seen blocks + optional onSeen screenshots. */
export async function waitForTurn(page: Page, opts: { t0: number; timeoutMs: number; onTick?: () => Promise<void> }) {
  const deadline = Date.now() + opts.timeoutMs; const run = page.getByTestId("run-view").last();
  let firstSkeletonMs: number | null = null; let firstAnswerMs: number | null = null;
  const seen: Record<string, number> = {};
  const ids = ["run-skeleton", "pending-row", "thinking-block", "plan-stepper", "working-row", "working-chips", "step-summary", "answer-block", "answer-badge", "sources-list", "inline-artifacts", "artifact-pending", "data-gap", "chat-error", "run-header", "run-timer", "run-footer"];
  while (Date.now() < deadline) {
    for (const id of ids) if (!(id in seen) && (await run.getByTestId(id).count().catch(() => 0)) > 0) { seen[id] = Date.now() - opts.t0; if (firstSkeletonMs == null && ["run-skeleton", "pending-row", "thinking-block", "working-row"].includes(id)) firstSkeletonMs = seen[id]; }
    if (firstAnswerMs == null && "answer-block" in seen) {
      const txt = await run.getByTestId("answer-block").first().innerText().catch(() => "");
      if (txt.trim().length > 0) firstAnswerMs = Date.now() - opts.t0;
    }
    if (opts.onTick) await opts.onTick();
    const streaming = await page.getByTestId("assistant-streaming").count().catch(() => 0);
    const errored = ("chat-error" in seen || "data-gap" in seen) && streaming === 0;
    if (("answer-block" in seen && streaming === 0 && firstAnswerMs != null) || errored) {
      // give the run ~1.5 s to settle (thinking collapses, working rows resolve) then confirm still not streaming
      await page.waitForTimeout(1500);
      if ((await page.getByTestId("assistant-streaming").count().catch(() => 0)) === 0) break;
    }
    await page.waitForTimeout(200);
  }
  const fs0 = await page.evaluate(() => (window as unknown as { __first: Record<string, number> }).__first).catch(() => ({} as Record<string, number>));
  const skelIn = Math.min(...["run-skeleton", "pending-row", "thinking-block", "working-row", "working-band"].map((k) => fs0[k]).filter((x): x is number => typeof x === "number"));
  return { firstSkeletonMs: Number.isFinite(skelIn) ? skelIn : firstSkeletonMs, firstAnswerMs: fs0["answer-text"] ?? firstAnswerMs, polled: { firstSkeletonMs, firstAnswerMs }, firstSeenInPage: fs0, seen, totalMs: Date.now() - opts.t0 };
}

export async function domOrder(page: Page) {
  const run = page.getByTestId("run-view").last();
  return run.evaluate((el) => Array.from(el.querySelectorAll("[data-testid]")).map((n) => n.getAttribute("data-testid")).filter((x) => ["thinking-block", "working-list", "working-row", "answer-block", "inline-artifacts", "sources-list"].includes(x!)) as string[]).catch(() => [] as string[]);
}
export function orderOk(o: string[]) {
  const idx = (k: string) => o.indexOf(k); const work = Math.max(idx("working-list"), idx("working-row"));
  return idx("thinking-block") === 0 && work > 0 && idx("answer-block") > work && (idx("sources-list") === -1 || idx("sources-list") > idx("answer-block"));
}

export async function sendMessage(page: Page, text: string) {
  const input = page.getByTestId("composer-input");
  await expect(input).toBeVisible({ timeout: 20_000 });
  await input.fill(text);
  await page.getByTestId("composer-send").click();
}
