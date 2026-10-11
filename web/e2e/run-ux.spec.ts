import { test, expect, primeSettings, captureErrors } from "./helpers";
import type { Page, TestInfo } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Run-UX end-to-end (desktop 1440x900 + mobile 390x844), recorded on video.
 *  1. upload  — 3 fixture images + the UX PDF + the compendium DOCX through the composer → chips reach `ready`/`local` (honest `error` fails),
 *               every file is persisted as an Artifact (backend /artifacts), shown in the chat (image grid + attachment chips) and in /artifacts.
 *  2. report  — "portfolio report" turn: stream order Thinking (top) → Working row (before the action) → answer → Sources (collapsed, under),
 *               the report PDF is created, stored (Artifacts + OnDemand Media API status) and appears in the Artifacts panel/route.
 * Every action is logged with an ISO-8601 UTC timestamp (test-results/run-ux-log.ndjson). A smoothness score /10 is computed per run from
 * measured signals (first skeleton latency, CLS, long tasks, order, console errors, artifact present) and written to run-ux-scores.json.
 */
const FIX = path.resolve(__dirname, "fixtures/ux");
const FILES = ["geothermal.jpg", "bar-chart.jpg", "memo.jpg", "run-ux-before-after.pdf", "compendium.docx"];
const OUT = path.resolve(__dirname, process.env.UX_OUT ?? "../proof/run-ux"); // NOT test-results/ (Playwright wipes it per run)
const LOG = path.join(OUT, "run-ux-log.ndjson");
const SCORES = path.join(OUT, "run-ux-scores.json");
fs.mkdirSync(OUT, { recursive: true });

test.use({ video: { mode: "on", size: { width: 1280, height: 800 } } });

let curPage: Page | null = null;
function logger(ti: TestInfo) {
  return (action: string, extra: Record<string, unknown> = {}) => {
    const line = { at: new Date().toISOString(), project: ti.project.name, test: ti.title, action, ...extra };
    fs.appendFileSync(LOG, JSON.stringify(line) + "\n");
  };
}
async function installProbes(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __ux: { cls: number; longTasks: number; longMs: number; shifts: { v: number; t: number; nodes: string[] }[] } };
    w.__ux = { cls: 0, longTasks: 0, longMs: 0, shifts: [] };
    const desc = (n: Node | null) => { const e = n as HTMLElement | null; if (!e || !e.tagName) return "?"; return `${e.tagName.toLowerCase()}${e.getAttribute?.("data-testid") ? `[${e.getAttribute("data-testid")}]` : ""}.${String(e.className || "").split(" ").slice(0, 2).join(".")}`; };
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!e.hadRecentInput) { w.__ux.cls += e.value; w.__ux.shifts.push({ v: e.value, t: Math.round(e.startTime), nodes: ((e as unknown as { sources?: { node: Node | null }[] }).sources ?? []).map((x) => `${desc(x.node)} ${JSON.stringify((x as unknown as { previousRect: DOMRect }).previousRect ? { y0: Math.round((x as unknown as { previousRect: DOMRect }).previousRect.y), h0: Math.round((x as unknown as { previousRect: DOMRect }).previousRect.height), y1: Math.round((x as unknown as { currentRect: DOMRect }).currentRect.y), h1: Math.round((x as unknown as { currentRect: DOMRect }).currentRect.height) } : {})}`) }); } }).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) { w.__ux.longTasks += 1; w.__ux.longMs += e.duration; } }).observe({ type: "longtask", buffered: true });
    } catch { /* unsupported */ }
  });
}
type UxShift = { v: number; t: number; nodes: string[] };
const uxStats = (page: Page) => page.evaluate(() => {
  const w = window as unknown as { __ux: { cls: number; longTasks: number; longMs: number; shifts: UxShift[] }; __marks?: { a: string; t: number }[] };
  const marks = w.__marks ?? []; const t0 = marks.find((m) => m.a.startsWith("send"))?.t ?? 0; const t1 = marks.find((m) => m.a === "stream finished")?.t ?? Infinity;
  // CLS of the STREAM window (send → stream finished): what the user watches while the run renders. Shifts after the run (opening the panel,
  // expanding Sources) are reported separately — they follow a click and are not stream jank.
  const streamCls = w.__ux.shifts.filter((x) => x.t >= t0 && x.t <= t1).reduce((a, x) => a + x.v, 0);
  const after = w.__ux.shifts.filter((x) => x.t > t1).map((x) => ({ ...x, afterMark: [...marks].reverse().find((m) => m.t <= x.t)?.a ?? null }));
  return { ...w.__ux, streamCls, after, marks };
});
function score(s: { firstSkeletonMs: number | null; cls: number; longTasks: number; errors: number; orderOk: boolean; artifactOk: boolean }) {
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
function saveScore(ti: TestInfo, row: Record<string, unknown>) {
  const all = fs.existsSync(SCORES) ? (JSON.parse(fs.readFileSync(SCORES, "utf8")) as unknown[]) : [];
  all.push({ at: new Date().toISOString(), project: ti.project.name, test: ti.title, iteration: Number(process.env.UX_ITERATION ?? 1), ...row });
  fs.writeFileSync(SCORES, JSON.stringify(all, null, 2));
}
async function shot(page: Page, ti: TestInfo, name: string) {
  const p = path.join(OUT, "run-ux-shots", `${ti.project.name}-${name}.png`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  await page.screenshot({ path: p, fullPage: false });
}

test.describe("Run UX — uploads, stream order, artifacts", () => {
  test("upload: 3 images + PDF + DOCX are stored, retrievable and displayed in chat and Artifacts", async ({ page, request }, ti) => {
    test.setTimeout(300_000);
    const log = logger(ti); const errors = captureErrors(page);
    curPage = page; await installProbes(page); await primeSettings(page);
    log("goto /chat"); await page.goto("/chat?skip=1"); await expect(page.getByTestId("composer-input")).toBeVisible();
    await shot(page, ti, "upload-0-empty");
    log("attach files", { files: FILES });
    await page.getByTestId("attachment-input").setInputFiles(FILES.map((f) => path.join(FIX, f)));
    await expect(page.getByTestId("attachment-chip")).toHaveCount(FILES.length);
    log("chips rendered", { count: FILES.length });
    await shot(page, ti, "upload-1-progress");
    await expect.poll(async () => page.getByTestId("attachment-chip").evaluateAll((els) => els.map((e) => e.getAttribute("data-status"))), { timeout: 180_000, intervals: [500] })
      .toEqual(FILES.map(() => "ready"));
    log("all chips ready", { grounded: await page.getByTestId("attachment-chip").evaluateAll((els) => els.map((e) => e.getAttribute("data-grounded"))) });
    await shot(page, ti, "upload-2-ready");

    // storage + retrieval: every file is an Artifact whose content endpoint returns the same byte length
    const list = (await (await request.get("/api/artifacts?limit=100")).json()) as { data: { id: string; name: string; sizeBytes: number; mediaStatus: string | null; contentUrl: string }[] };
    for (const f of FILES) {
      const a = list.data.find((x) => x.name === f);
      expect(a, `artifact for ${f}`).toBeTruthy();
      const body = await (await request.get(a!.contentUrl)).body();
      expect(body.length, `content bytes for ${f}`).toBe(fs.statSync(path.join(FIX, f)).size);
      log("artifact verified", { name: f, id: a!.id, bytes: body.length, mediaStatus: a!.mediaStatus });
    }

    // send → user bubble shows the image grid + document chips
    log("send message");
    await page.getByTestId("composer-input").fill("Summarise the attached memo, chart and UX document in two sentences.");
    await page.getByTestId("composer-send").click();
    await expect(page.getByTestId("message-images").getByTestId("image-grid")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("message-attachments")).toContainText("compendium.docx");
    log("user bubble shows image grid + doc chips");
    await page.getByTestId("message-images").locator("button.media-tile").first().click();
    await expect(page.getByTestId("lightbox")).toBeVisible(); log("lightbox opened");
    await shot(page, ti, "upload-3-lightbox");
    await page.keyboard.press("ArrowRight"); await expect(page.getByTestId("lightbox-counter")).toContainText("2 /");
    await page.keyboard.press("Escape"); await expect(page.getByTestId("lightbox")).toBeHidden(); log("lightbox keyboard nav + close");

    // Artifacts route lists them
    log("goto /artifacts"); await page.goto("/artifacts?skip=1");
    await expect(page.getByTestId("artifacts-page")).toBeVisible();
    for (const f of FILES) await expect(page.getByTestId("artifact-card").filter({ hasText: f }).first()).toBeVisible();
    log("artifacts route lists all 5");
    await page.getByTestId("artifacts-filter-image").click().catch(() => undefined);
    await shot(page, ti, "upload-4-artifacts");
    const st = await uxStats(page);
    const real = errors.filter((e) => !/hydrat|ResizeObserver/i.test(e));
    const sc = score({ firstSkeletonMs: 0, cls: st.cls, longTasks: st.longTasks, errors: real.length, orderOk: true, artifactOk: true });
    saveScore(ti, { ...sc, cls: st.cls, topShifts: [...st.shifts].sort((a, b) => b.v - a.v).slice(0, 6), longTasks: st.longTasks, errors: real });
    log("score", sc);
  });

  test("report: Thinking top → Working before action → answer → Sources, PDF stored and listed in Artifacts", async ({ page, request }, ti) => {
    test.setTimeout(420_000);
    const log = logger(ti); const errors = captureErrors(page);
    curPage = page; await installProbes(page); await primeSettings(page);
    log("goto /chat"); await page.goto("/chat?skip=1"); await expect(page.getByTestId("composer-input")).toBeVisible();
    const before = ((await (await request.get("/api/artifacts?limit=200")).json()) as { data: { id: string }[] }).data.map((a) => a.id);
    await page.getByTestId("composer-input").fill("Write a short portfolio report on Fervo Energy's latest news as a PDF.");
    await page.evaluate(() => { (window as unknown as { __marks: { a: string; t: number }[] }).__marks = [{ a: "send", t: performance.now() }]; });
    const t0 = Date.now(); log("send report request");
    await page.getByTestId("composer-send").click();
    // skeleton: Thinking + Working appear on the first event
    const firstSkel = await page.locator('[data-testid="thinking-block"], [data-testid="working-row"], [data-testid="pending-row"]').first().waitFor({ timeout: 15_000 }).then(() => Date.now() - t0).catch(() => null);
    log("first skeleton", { ms: firstSkel }); await shot(page, ti, "report-1-skeleton");
    const order: string[] = []; const seen = new Set<string>();
    const ids = ["thinking-block", "plan-stepper", "working-row", "answer-block", "sources-list", "inline-artifacts", "data-gap"];
    const deadline = Date.now() + 360_000; let midShot = false;
    while (Date.now() < deadline) {
      for (const id of ids) if (!seen.has(id) && (await page.getByTestId(id).count()) > 0) { seen.add(id); order.push(id); log("block appeared", { id, ms: Date.now() - t0 }); }
      if (process.env.UX_LAYOUT) log("layout", await page.evaluate(() => { const c = document.querySelector(".openui-agent-composer-slot")?.getBoundingClientRect(); const se = document.scrollingElement!; const sa = document.querySelector(".openui-agent-thread-container, [class*='scroll-area']") as HTMLElement | null; const mc = document.querySelector('[data-testid="main-column"]') as HTMLElement | null; const chain: string[] = []; let n: HTMLElement | null = document.querySelector(".openui-agent-composer-slot"); while (n && chain.length < 12) { const cs = getComputedStyle(n); chain.push(`${n.tagName.toLowerCase()}.${String(n.className).split(" ")[0]}[${n.getAttribute("data-testid") ?? ""}] h=${Math.round(n.getBoundingClientRect().height)} disp=${cs.display} ov=${cs.overflowY} minh=${cs.minHeight} flex=${cs.flex}`); n = n.parentElement; }
        const sc = document.querySelector(".openui-agent-thread-scroll-container, .openui-agent-thread-scroll-area") as HTMLElement | null; const scs = sc ? getComputedStyle(sc) : null;
        return { chain: document.querySelector(".openui-agent-composer-slot")!.getBoundingClientRect().top > 800 ? chain : null, scroll: sc ? `${sc.className} h=${Math.round(sc.getBoundingClientRect().height)} sh=${sc.scrollHeight} ov=${scs!.overflowY} minh=${scs!.minHeight} flex=${scs!.flex}` : null, composerTop: c ? Math.round(c.top) : null, composerH: c ? Math.round(c.height) : null, docScroll: se.scrollHeight, docTop: se.scrollTop, main: mc ? { sh: mc.scrollHeight, ch: mc.clientHeight, st: mc.scrollTop } : null, sa: sa ? { cls: sa.className.slice(0, 60), sh: sa.scrollHeight, ch: sa.clientHeight } : null }; }));
      if (!midShot && seen.has("answer-block")) { midShot = true; await shot(page, ti, "report-2-streaming"); }
      const running = await page.getByTestId("assistant-streaming").count();
      if (seen.has("answer-block") && running === 0 && (await page.getByTestId("assistant-message").count()) > 0) break;
      await page.waitForTimeout(250);
    }
    await page.evaluate(() => { (window as unknown as { __marks: { a: string; t: number }[] }).__marks.push({ a: "stream finished", t: performance.now() }); });
    log("stream finished", { ms: Date.now() - t0, order });
    // DOM order inside the settled turn
    const run = page.getByTestId("run-view").last();
    await expect(run).toBeVisible();
    const domOrder = await run.evaluate((el) => Array.from(el.querySelectorAll("[data-testid]")).map((n) => n.getAttribute("data-testid")).filter((x) => ["thinking-block", "working-list", "answer-block", "inline-artifacts", "sources-list"].includes(x!)));
    log("settled DOM order", { domOrder });
    const idx = (k: string) => domOrder.indexOf(k);
    const orderOk = idx("thinking-block") === 0 && idx("working-list") > 0 && idx("answer-block") > idx("working-list") && (idx("sources-list") === -1 || idx("sources-list") > idx("answer-block"));
    expect(orderOk, `DOM order ${domOrder.join(" → ")}`).toBe(true);
    // Working row: chips, never an empty {} box, resolved
    const work = run.getByTestId("working-row").first();
    await expect(work).toHaveAttribute("data-state", /done|failed/);
    await expect(work.getByTestId("working-chips").locator("img, span").first()).toBeVisible();
    expect(await run.locator("pre, code").filter({ hasText: /^\s*\{\s*\}\s*$/ }).count(), "no empty {} box").toBe(0);
    // Thinking collapsed after answer
    if (await run.getByTestId("thinking-block").count()) await expect(run.getByTestId("thinking-block")).toHaveAttribute("data-state", "collapsed");
    // Sources collapsed by default and numbered when opened
    if (await run.getByTestId("sources-list").count()) {
      await expect(run.getByTestId("sources-toggle")).toHaveAttribute("aria-expanded", "false");
      await run.getByTestId("sources-toggle").click(); log("sources expanded");
    }
    await shot(page, ti, "report-3-settled");
    // artifact
    const card = run.getByTestId("artifact-card").first();
    const artifactOk = await card.waitFor({ timeout: 60_000 }).then(() => true).catch(() => false);
    log("inline artifact card", { ok: artifactOk, gap: (await run.getByTestId("data-gap").count()) ? await run.getByTestId("data-gap").first().textContent() : null });
    expect(artifactOk, "report PDF artifact card in chat").toBe(true);
    const after = ((await (await request.get("/api/artifacts?limit=200")).json()) as { data: { id: string; name: string; mime: string; mediaStatus: string | null; mediaId: string | null; contentUrl: string; originEvent: string | null }[] }).data;
    const made = after.filter((a) => !before.includes(a.id) && a.mime === "application/pdf");
    expect(made.length, "new PDF artifact").toBeGreaterThan(0);
    const pdf = await (await request.get(made[0].contentUrl)).body();
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    log("report artifact stored", { id: made[0].id, name: made[0].name, bytes: pdf.length, mediaStatus: made[0].mediaStatus, mediaId: made[0].mediaId, origin: made[0].originEvent });
    // panel
    await page.getByTestId("artifacts-toggle").first().click();
    await expect(page.getByTestId("artifacts-panel")).toBeVisible();
    await expect(page.getByTestId("artifacts-panel").getByTestId("artifact-card").filter({ hasText: made[0].name }).first()).toBeVisible();
    log("artifact visible in Artifacts panel"); await shot(page, ti, "report-4-panel");
    const st = await uxStats(page);
    const real = errors.filter((e) => !/hydrat|ResizeObserver/i.test(e));
    const sc = score({ firstSkeletonMs: firstSkel, cls: st.streamCls, longTasks: st.longTasks, errors: real.length, orderOk, artifactOk });
    saveScore(ti, { ...sc, firstSkeletonMs: firstSkel, topShifts: [...st.shifts].sort((a, b) => b.v - a.v).slice(0, 8), streamShifts: st.shifts.filter((x) => x.t >= (st.marks[0]?.t ?? 0) && x.t <= (st.marks[1]?.t ?? Infinity)), marks: st.marks, postRunShifts: st.after, streamCls: st.streamCls, cls: st.cls, longTasks: st.longTasks, order, domOrder, errors: real });
    log("score", sc);
  });
});
