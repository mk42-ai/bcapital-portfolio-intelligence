import { test as base, expect, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OUT, LABEL, ROUTES, primeSettingsSafe, shot, na, logger, installProbes, mark, resetFirstSeen, uxWindow, score, SCORE_FORMULA, mergeJson, captureAll, waitForTurn, domOrder, orderOk, vpName } from "./qa-final-helpers";

/**
 * Lane G — QA-final state capture. Runs under the `qa-final` (1440×900) and `qa-final-mobile` (390×844, Pixel 7) projects — ONE worker.
 *   cd web && QA_LABEL=final BASE_URL=https://<frontend> npx playwright test e2e/qa-final.spec.ts --workers=1
 * Outputs → web/proof/qa-final/<label>/: <state>-<WxH>.png, qa-log.ndjson, console-errors.json, smoothness.json
 * Budget: ≤2 chat turns per viewport (report turn → most states; news turn with an unknown plugin id → data-gap attempt + 2nd first-token sample).
 * Selectors are defensive: a state whose test id is missing in this build is recorded as "n/a (not in baseline build)" in qa-log.ndjson, never a hard failure.
 */
const test = base;
const FIX_IMG = path.resolve(__dirname, "..", "tests", "fixtures", "bar-chart.png");
const UNKNOWN_PLUGIN = "plugin-0000000000";

async function prep(page: Page) { await installProbes(page); await primeSettingsSafe(page); }

test.describe(`qa-final [${LABEL}]`, () => {
  test("routes: console + page errors per route", async ({ page }, ti) => {
    test.setTimeout(240_000);
    await prep(page); const log = logger(ti, page); const vp = vpName(page);
    const perRoute: Record<string, unknown> = {};
    for (const route of ROUTES) {
      const errs = captureAll(page);
      log("goto", { route });
      const resp = await page.goto(route, { waitUntil: "domcontentloaded" }).catch((e) => { log("goto-failed", { route, error: String(e.message).slice(0, 200) }); return null; });
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
      await page.waitForTimeout(800);
      const real = errs.real();
      perRoute[route] = { status: resp?.status() ?? null, console: errs.all.filter((e) => e.kind === "console").length, pageerror: errs.all.filter((e) => e.kind === "pageerror").length, real: real.length, samples: real.slice(0, 5).map((e) => `${e.kind}: ${e.text}`) };
      log("route-errors", { route, ...(perRoute[route] as Record<string, unknown>) });
      await shot(page, ti, `route-${route.replace(/^\//, "").replace(/\//g, "_") || "root"}`);
      page.removeAllListeners("console"); page.removeAllListeners("pageerror");
    }
    mergeJson("console-errors.json", vp, perRoute, (all) => {
      const totals: Record<string, number> = {};
      for (const [k, v] of Object.entries(all)) if (k !== "totals") totals[k] = Object.values(v as Record<string, { real: number }>).reduce((a, r) => a + (r?.real ?? 0), 0);
      return { ...all, totals };
    });
  });

  test("chat: upload states, run states, sources, artifacts, lightbox, doc preview", async ({ page, request }, ti) => {
    test.setTimeout(600_000);
    await prep(page); const log = logger(ti, page); const vp = vpName(page); const errs = captureAll(page);
    const smooth: Record<string, unknown> = { viewport: vp, formula: SCORE_FORMULA };
    const states: Record<string, string | null> = {};
    const rec = async (state: string, extra: Record<string, unknown> = {}) => { states[state] = await shot(page, ti, state, extra); };
    const miss = (state: string, reason: string) => { states[state] = null; na(ti, page, state, reason); };

    log("goto /chat"); await page.goto("/chat?skip=1");
    await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 30_000 });
    const before = ((await (await request.get("/api/artifacts?limit=200")).json()) as { data: { id: string }[] }).data.map((a) => a.id);

    // ---------- upload states: idle → progress → success; failed via .exe
    await rec("upload-idle");
    await page.getByTestId("attachment-input").setInputFiles(FIX_IMG);
    await expect(page.getByTestId("attachment-chip")).toHaveCount(1, { timeout: 10_000 });
    const st0 = await page.getByTestId("attachment-chip").getAttribute("data-status");
    if (st0 === "uploading") await rec("upload-progress", { status: st0 }); else miss("upload-progress", `chip already ${st0} when captured (upload faster than screenshot)`);
    const finalStatus = await expect.poll(() => page.getByTestId("attachment-chip").first().getAttribute("data-status"), { timeout: 120_000, intervals: [500] }).not.toBe("uploading").then(() => page.getByTestId("attachment-chip").first().getAttribute("data-status")).catch(() => "timeout");
    log("upload finished", { status: finalStatus, grounded: await page.getByTestId("attachment-chip").first().getAttribute("data-grounded").catch(() => null) });
    if (finalStatus === "ready") await rec("upload-success"); else await rec("upload-success-NOT-ready", { status: finalStatus });
    const exe = path.join(os.tmpdir(), "qa-final-bad.exe"); fs.writeFileSync(exe, Buffer.from("MZ" + "x".repeat(600)));
    await page.getByTestId("attachment-input").setInputFiles(exe);
    const failed = page.getByTestId("attachment-chip").filter({ hasText: /\.exe/ });
    if (await failed.count()) {
      await expect(failed.first()).toHaveAttribute("data-status", "error", { timeout: 10_000 }).catch(() => undefined);
      await rec("upload-failed", { status: await failed.first().getAttribute("data-status"), code: await failed.first().getAttribute("data-code") });
      await failed.first().getByTestId("attachment-remove").click().catch(() => undefined);
    } else miss("upload-failed", ".exe was filtered by the file input accept list — no chip rendered");

    // ---------- turn 1: report (+ attached chart) — streaming states
    const q1 = "Write a short portfolio report on Fervo Energy with cited sources. Mention the attached chart in one sentence.";
    const live: Record<string, boolean> = {};
    const run = () => page.getByTestId("run-view").last();
    const tick = async () => {
      if (!live.skel && (await page.getByTestId("run-skeleton").count())) { live.skel = true; await rec("run-skeleton"); }
      if (!live.think && (await run().locator('[data-testid="thinking-block"][data-state="streaming"]').count())) { live.think = true; await rec("thinking-streaming"); }
      if (!live.work && (await run().locator('[data-testid="working-row"][data-state="running"]').count())) { live.work = true; await rec("working-row"); }
      if (!live.plan && (await run().getByTestId("plan-stepper").count())) { live.plan = true; await rec("plan-stepper"); }
      if (!live.answer && (await run().getByTestId("answer-block").count()) && (await page.getByTestId("assistant-streaming").count())) { live.answer = true; await rec("answer-streaming"); }
      if (!live.pending && (await run().getByTestId("artifact-pending").count())) { live.pending = true; await rec("artifact-pending"); }
      if (!live.header && (await run().getByTestId("run-header").count())) { live.header = true; await rec("run-header"); }
    };
    await page.getByTestId("composer-input").fill(q1);
    await mark(page, "send:t1"); await resetFirstSeen(page); const t1 = Date.now(); log("send turn 1", { q: q1 });
    await page.getByTestId("composer-send").click();
    const r1 = await waitForTurn(page, { t0: t1, timeoutMs: 300_000, onTick: tick });
    await mark(page, "finish:t1"); log("turn 1 settled", r1);
    if (!live.think) miss("thinking-streaming", r1.seen["thinking-block"] != null ? "thinking-block never observed in data-state=streaming during polling" : "thinking-block not rendered in this run");
    if (!live.work) miss("working-row", r1.seen["working-row"] != null ? "working-row never observed in data-state=running during polling" : "working-row not rendered in this run");
    if (!live.skel) miss("run-skeleton", "run-skeleton not observed (first frame arrived before the first poll)");
    if (!live.plan) miss("plan-stepper", "plan-stepper not rendered in this run");
    if (!live.pending) miss("artifact-pending", "artifact-pending not observed during polling");
    if (!live.header) miss("run-header", "n/a (not in baseline build — Lane B adds run-header)");
    for (const id of ["run-timer", "run-footer"]) if (!(await run().getByTestId(id).count())) miss(id, `n/a (not in baseline build — Lane B adds ${id})`); else await rec(id);

    // settled states
    const think = run().getByTestId("thinking-block");
    if (await think.count()) { const s = await think.first().getAttribute("data-state"); await rec("thinking-collapsed", { dataState: s }); if (s !== "collapsed") log("thinking not collapsed after answer", { state: s }); } else miss("thinking-collapsed", "no thinking-block in this run");
    const work = run().getByTestId("working-row");
    if (await work.count()) { const s = await work.first().getAttribute("data-state"); await rec("done-row", { dataState: s }); } else miss("done-row", "no working-row in this run");
    const dom1 = await domOrder(page); log("dom order t1", { dom1 });
    // sources
    const srcList = run().getByTestId("sources-list");
    if (await srcList.count()) {
      await srcList.first().scrollIntoViewIfNeeded().catch(() => undefined);
      const tog = run().getByTestId("sources-toggle").first();
      await rec("sources-strip", { expanded: await tog.getAttribute("aria-expanded").catch(() => null) });
      if (await tog.count()) { await tog.click().catch(() => undefined); await page.waitForTimeout(400); await rec("sources-expanded", { expanded: await tog.getAttribute("aria-expanded").catch(() => null) }); await tog.click().catch(() => undefined); }
      else miss("sources-expanded", "sources-toggle not present");
    } else { miss("sources-strip", "no sources-list in this run"); miss("sources-expanded", "no sources-list in this run"); }
    // artifacts card (inline, after the report request) — may arrive a little after the answer
    const card = run().locator('[data-testid="inline-artifacts"], [data-testid="artifact-card"]').first();
    const artifactOk = await card.waitFor({ timeout: 60_000 }).then(() => true).catch(() => false);
    if (artifactOk) { await card.scrollIntoViewIfNeeded().catch(() => undefined); await rec("artifacts-card"); } else miss("artifacts-card", `no inline-artifacts/artifact-card in the run (data-gap: ${(await run().getByTestId("data-gap").count()) ? await run().getByTestId("data-gap").first().textContent() : "none"})`);
    // doc preview: artifact-open (Lane C/E) → else artifact-preview-btn on the inline card → else via panel
    const openBtn = run().locator('[data-testid="artifact-open"], [data-testid="artifact-preview-btn"]').first();
    if (await openBtn.count()) {
      await openBtn.click().catch(() => undefined);
      const pane = page.locator('[data-testid="side-pane"], [data-testid="artifact-preview"], [data-testid="artifacts-panel"]').first();
      const ok = await pane.waitFor({ timeout: 15_000 }).then(() => true).catch(() => false);
      await page.waitForTimeout(1500); // let the PDF iframe paint
      if (ok) await rec("doc-preview", { via: await openBtn.getAttribute("data-testid") }); else miss("doc-preview", "no side-pane/artifact-preview opened after clicking the artifact button");
      await page.keyboard.press("Escape").catch(() => undefined);
      await page.locator('[data-testid="artifact-preview-back"], [data-testid="artifacts-close"], [data-testid="side-pane-close"]').first().click({ timeout: 2000 }).catch(() => undefined);
    } else miss("doc-preview", artifactOk ? "no artifact-open / artifact-preview-btn inside the run" : "no artifact card to open");
    // lightbox: user-bubble image grid (uploaded chart) or inline image thumb
    const tile = page.locator('[data-testid="message-images"] [data-testid="image-grid-tile"], [data-testid="image-thumb"], [data-testid="inline-images"] button').first();
    if (await tile.count()) {
      await tile.scrollIntoViewIfNeeded().catch(() => undefined); await tile.click().catch(() => undefined);
      const lb = page.getByTestId("lightbox");
      if (await lb.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false)) { await page.waitForTimeout(400); await rec("lightbox"); await page.keyboard.press("Escape"); } else miss("lightbox", "image tile clicked but no [data-testid=lightbox] appeared");
    } else miss("lightbox", "no image tile in the thread (upload not shown as image grid)");
    // video side pane (only if a video exists in the thread)
    const vid = page.locator('[data-testid="video-poster"], [data-testid="video-play"], [data-testid="inline-video"]').first();
    if (await vid.count()) { await vid.click().catch(() => undefined); await page.waitForTimeout(800); if (await page.getByTestId("side-pane").count()) await rec("video-side-pane"); else await rec("video-inline"); await page.keyboard.press("Escape").catch(() => undefined); }
    else miss("video-side-pane", "n/a — no video artifact in this thread (honest: none produced by the report run)");
    const ux1 = await uxWindow(page, "t1");
    const s1 = score({ firstSkeletonMs: r1.firstSkeletonMs, cls: ux1.streamCls, longTasks: ux1.longTasks, errors: errs.real().length, orderOk: orderOk(dom1), artifactOk });
    smooth.turn1 = { question: q1, firstSkeletonMs: r1.firstSkeletonMs, firstTokenMs: r1.firstAnswerMs, totalMs: r1.totalMs, seen: r1.seen, ...ux1, domOrder: dom1, orderOk: orderOk(dom1), artifactOk, errors: errs.real().length, score: s1 };
    log("score t1", { ...s1, firstTokenMs: r1.firstAnswerMs });

    // ---------- turn 2: news question with an unknown plugin id injected into context.pluginIds (data-gap attempt) + 2nd first-token sample
    let injected = false;
    await page.route("**/api/chat", async (route) => {
      try { const b = JSON.parse(route.request().postData() ?? "{}"); b.context = { ...(b.context ?? {}), pluginIds: [...new Set([...(b.context?.pluginIds ?? []), UNKNOWN_PLUGIN])] }; injected = true; await route.continue({ postData: JSON.stringify(b) }); }
      catch { await route.continue(); }
    });
    const q2 = "What is the latest news about Fervo Energy? Cite sources.";
    const live2: Record<string, boolean> = {};
    const tick2 = async () => { if (!live2.gap && (await run().getByTestId("data-gap").count())) { live2.gap = true; await rec("data-gap", { text: (await run().getByTestId("data-gap").first().textContent().catch(() => ""))?.slice(0, 200) }); } };
    const gap1 = await run().getByTestId("data-gap").count();
    if (gap1 && !live.gap1) { live.gap1 = true; await rec("data-gap", { turn: 1, text: (await run().getByTestId("data-gap").first().textContent().catch(() => ""))?.slice(0, 200) }); }
    await page.getByTestId("composer-input").fill(q2);
    await mark(page, "send:t2"); await resetFirstSeen(page); const t2 = Date.now(); log("send turn 2", { q: q2, injectedPlugin: UNKNOWN_PLUGIN });
    await page.getByTestId("composer-send").click();
    const r2 = await waitForTurn(page, { t0: t2, timeoutMs: 240_000, onTick: tick2 });
    await mark(page, "finish:t2"); await page.unroute("**/api/chat"); log("turn 2 settled", { ...r2, injected });
    await tick2();
    if (!live2.gap && !live.gap1) miss("data-gap", `data-gap not reproducible — bridge resolvePluginIds() silently drops unknown ids (${UNKNOWN_PLUGIN} injected=${injected}); no failed call in this run`);
    const dom2 = await domOrder(page); const ux2 = await uxWindow(page, "t2");
    const s2 = score({ firstSkeletonMs: r2.firstSkeletonMs, cls: ux2.streamCls, longTasks: ux2.longTasks, errors: errs.real().length, orderOk: orderOk(dom2), artifactOk: true /* n/a for a news turn → credited, as run-ux does for non-report turns */ });
    smooth.turn2 = { question: q2, firstSkeletonMs: r2.firstSkeletonMs, firstTokenMs: r2.firstAnswerMs, totalMs: r2.totalMs, seen: r2.seen, ...ux2, domOrder: dom2, orderOk: orderOk(dom2), artifactNA: true, errors: errs.real().length, score: s2 };
    await rec("thread-settled");
    log("score t2", { ...s2, firstTokenMs: r2.firstAnswerMs });

    // ---------- artifacts panel + /artifacts page (filled / empty)
    const toggle = page.locator('[data-testid="artifacts-toggle"], [data-testid="artifacts-toggle-shell"]').first();
    if (await toggle.count()) { await toggle.click().catch(() => undefined); if (await page.getByTestId("artifacts-panel").waitFor({ timeout: 10_000 }).then(() => true).catch(() => false)) { await page.waitForTimeout(600); await rec("artifacts-panel"); } else miss("artifacts-panel", "panel did not open"); await page.locator('[data-testid="artifacts-close"]').first().click({ timeout: 2000 }).catch(() => page.keyboard.press("Escape")); }
    else miss("artifacts-panel", "no artifacts-toggle on /chat");
    const after = ((await (await request.get("/api/artifacts?limit=200")).json()) as { data: { id: string; name: string; mime: string; mediaStatus: string | null }[] }).data;
    const made = after.filter((a) => !before.includes(a.id)); log("new artifacts this test", { count: made.length, names: made.map((a) => a.name).slice(0, 8) });
    await page.goto("/artifacts?skip=1"); await page.getByTestId("artifacts-page").waitFor({ timeout: 20_000 }).catch(() => undefined);
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined); await page.waitForTimeout(500);
    if (await page.getByTestId("artifacts-empty").count()) { await rec("artifacts-empty"); miss("artifacts-filled", "artifact list is empty"); }
    else { await rec("artifacts-filled", { total: after.length }); miss("artifacts-empty", `n/a — list never empty (${after.length} artifacts; /artifacts has no thread filter in this build)`); }
    // doc preview via /artifacts page if the in-run route did not work
    if (!states["doc-preview"]) {
      const btn = page.locator('[data-testid="artifact-card"]:has-text(".pdf") [data-testid="artifact-preview-btn"], [data-testid="artifact-card"]:has-text(".pdf") [data-testid="artifact-open"]').first();
      if (await btn.count()) { await btn.click().catch(() => undefined); if (await page.locator('[data-testid="artifact-preview"], [data-testid="side-pane"]').first().waitFor({ timeout: 15_000 }).then(() => true).catch(() => false)) { await page.waitForTimeout(1500); await rec("doc-preview", { via: "/artifacts" }); } }
    }
    const real = errs.real();
    const overall = +(((s1.total + s2.total) / 2)).toFixed(2);
    smooth.overall = overall; smooth.errors = real.slice(0, 10).map((e) => `${e.kind}: ${e.text}`); smooth.states = states;
    mergeJson("smoothness.json", vp, smooth, (all) => {
      const vps = Object.entries(all).filter(([k]) => k !== "overall" && k !== "formula").map(([, v]) => (v as { overall: number }).overall).filter((x) => typeof x === "number");
      return { ...all, formula: SCORE_FORMULA, overall: vps.length ? +(vps.reduce((a, b) => a + b, 0) / vps.length).toFixed(2) : null };
    });
    mergeJson("console-errors.json", `${vp}:chat-flow`, { console: errs.all.filter((e) => e.kind === "console").length, pageerror: errs.all.filter((e) => e.kind === "pageerror").length, real: real.length, samples: real.slice(0, 8).map((e) => `${e.kind}: ${e.text}`) });
    fs.writeFileSync(path.join(OUT, `states-${vp}.json`), JSON.stringify(states, null, 2));
    log("chat flow done", { overall, captured: Object.values(states).filter(Boolean).length, na: Object.entries(states).filter(([, v]) => !v).map(([k]) => k) });
  });
});
