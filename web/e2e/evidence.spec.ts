import { test as base, expect, type Page, type TestInfo, type APIRequestContext, type Download } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { primeSettings, isAllowed } from "./helpers";

/**
 * Evidence suite (turn3/e2e) — runs against the LIVE deployment with video/trace/screenshot ALWAYS on (playwright.evidence.config.ts).
 *  T1 document upload → grounded answer → artifact listed (source upload)      T2(+T3) image upload → answer → lightbox / side pane preview
 *  T4 reload persistence (/artifacts hard, thread re-open soft)                T5 download of the PDF (download event | new tab | request.get)
 *  T6 video preview (relay allow-list, backend ingest auth, no inline autoplay, video icon fallback)   T7 upload failure + retry (exe, 503 mock)
 *  T8 = the evidence-mobile project runs T1–T4 at 390×844 and asserts no horizontal overflow on /chat and /artifacts.
 * Every step logs an ISO-UTC line (console + proof/evidence/evidence-log.ndjson). App gaps → annotation type "app-gap" + expect.soft (never silent).
 * No application source is touched; only data-testid selectors from the shipped UI are used.
 */
const OUT = path.resolve(__dirname, "../proof/evidence");
const LOG = path.join(OUT, "evidence-log.ndjson");
const LATENCY = path.join(OUT, "latency.json");
fs.mkdirSync(OUT, { recursive: true });
const API_URL = process.env.API_URL ?? "https://sb-22j0v0grzslt.vercel.run";
const FIX = path.resolve(__dirname, "../tests/fixtures");
const PDF = path.resolve(__dirname, "../../docs/reference/submit-query-v1-sse-reference.pdf");
const PDF_NAME = path.basename(PDF);
const IMG = path.join(FIX, "bar-chart.png");
const IMG_NAME = path.basename(IMG);
const MP4 = path.join(FIX, "sample-video.mp4");

const iso = () => new Date().toISOString();
const vpTag = (page: Page) => ((page.viewportSize()?.width ?? 1440) <= 500 ? "390x844" : "1440x900");
function logger(ti: TestInfo, page?: Page) {
  return (action: string, extra: Record<string, unknown> = {}) => {
    const line = { at: iso(), project: ti.project.name, viewport: page ? vpTag(page) : ti.project.name, test: ti.title, action, ...extra };
    console.log(`[${line.at}] [${ti.project.name}] ${action}${Object.keys(extra).length ? " " + JSON.stringify(extra) : ""}`);
    try { fs.appendFileSync(LOG, JSON.stringify(line) + "\n"); } catch { /* best effort */ }
  };
}
function gap(ti: TestInfo, what: string, detail: string) {
  ti.annotations.push({ type: "app-gap", description: `${what}: ${detail}` });
  console.log(`[${iso()}] APP-GAP ${what}: ${detail}`);
  expect.soft(false, `${what} — ${detail}`).toBe(true);
}
/** Known/accepted gap: annotation only (no soft failure) — used where the task marks the gap as known. */
function knownGap(ti: TestInfo, what: string, detail: string) {
  ti.annotations.push({ type: "app-gap", description: `${what}: ${detail}` });
  console.log(`[${iso()}] APP-GAP(known) ${what}: ${detail}`);
}
function finding(ti: TestInfo, what: string, detail: string) {
  ti.annotations.push({ type: "app-finding", description: `${what}: ${detail}` });
  console.log(`[${iso()}] FINDING ${what}: ${detail}`);
}
function appendLatency(row: Record<string, unknown>) {
  let all: unknown[] = [];
  try { all = JSON.parse(fs.readFileSync(LATENCY, "utf8")) as unknown[]; } catch { all = []; }
  all.push({ at: iso(), ...row });
  fs.writeFileSync(LATENCY, JSON.stringify(all, null, 2));
}
async function shot(page: Page, ti: TestInfo, name: string) {
  const p = ti.outputPath(`${name}.png`);
  await page.screenshot({ path: p, fullPage: false }).catch(() => undefined);
  await ti.attach(name, { path: p, contentType: "image/png" }).catch(() => undefined);
  return p;
}

/** localStorage carried from test to test inside the serial group (threads/attachments live in localStorage; each test gets a fresh context). */
const carried: Record<string, Record<string, string>> = {};
/** Extra console noise that is expected inside this suite (the T7 mock answers 503 on purpose; the chip then shows the error state). */
const EXTRA_ALLOW = [/status of 503/i, /status of 400/i, /api\/media.*(503|400)/i, /ResizeObserver loop/i];
const allowed = (m: string) => isAllowed(m) || EXTRA_ALLOW.some((re) => re.test(m));

const test = base.extend<{ errors: string[] }>({
  errors: [async ({ page }, use, ti) => {
    await primeSettings(page);
    const prev = carried[ti.project.name];
    if (prev) await page.addInitScript((dump) => { for (const [k, v] of Object.entries(dump as Record<string, string>)) if (!localStorage.getItem(k)) localStorage.setItem(k, v); }, prev);
    const errs: string[] = [];
    page.on("pageerror", (e) => { const m = "pageerror: " + e.message; if (!allowed(m)) errs.push(m); });
    page.on("console", (m) => { if (m.type() !== "error") return; const t = "console: " + m.text().slice(0, 300); if (!allowed(t)) errs.push(t); });
    await use(errs);
    try { carried[ti.project.name] = await page.evaluate(() => { const o: Record<string, string> = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; o[k] = localStorage.getItem(k)!; } return o; }); } catch { /* page gone */ }
    if (errs.length) ti.annotations.push({ type: "client-errors", description: errs.slice(0, 10).join(" | ") });
    expect(errs, "no real client-side page/console errors").toEqual([]);
  }, { auto: true }],
});

async function openChat(page: Page) {
  await page.goto("/chat?skip=1", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("attachment-input")).toBeAttached({ timeout: 30_000 });
}
async function attachAndWaitReady(page: Page, ti: TestInfo, file: string | { name: string; mimeType: string; buffer: Buffer }, timeout = 120_000) {
  const log = logger(ti, page);
  const name = typeof file === "string" ? path.basename(file) : file.name;
  const before = await page.getByTestId("attachment-chip").count();
  log("attach file", { name, sizeBytes: typeof file === "string" ? fs.statSync(file).size : file.buffer.length });
  const t0 = Date.now();
  await page.getByTestId("attachment-input").setInputFiles(file);
  const chip = page.getByTestId("attachment-chip").nth(before);
  await expect(chip).toBeAttached({ timeout: 15_000 });
  await expect(chip).toContainText(name);
  const first = await chip.getAttribute("data-status");
  log("chip created", { name, status: first });
  if (first === "uploading") log("chip status=uploading observed", { name });
  else ti.annotations.push({ type: "note", description: `${name}: first observed chip status "${first}" (upload finished before the first DOM read)` });
  await expect(chip).toHaveAttribute("data-status", /^(ready|error)$/, { timeout });
  const status = await chip.getAttribute("data-status");
  const info = { name, status, code: await chip.getAttribute("data-code"), kind: await chip.getAttribute("data-kind"), ms: Date.now() - t0, text: (await chip.innerText()).replace(/\s+/g, " ").trim().slice(0, 160) };
  log("chip settled", info);
  return { chip, ...info };
}
type Turn = { firstTokenMs: number | null; totalMs: number; text: string };
async function askAndWait(page: Page, ti: TestInfo, question: string, deadline = 200_000): Promise<Turn> {
  const log = logger(ti, page);
  const runsBefore = await page.getByTestId("run-view").count();
  await page.getByTestId("composer-input").fill(question);
  await expect(page.getByTestId("composer-send")).toBeEnabled({ timeout: 30_000 });
  const t0 = Date.now(); log("send click", { question });
  await page.getByTestId("composer-send").click();
  const run = page.getByTestId("run-view").nth(runsBefore);
  const answer = run.getByTestId("answer-block");
  let firstTokenMs: number | null = null; let text = "";
  while (Date.now() - t0 < deadline) {
    if ((await answer.count()) > 0) {
      const t = ((await answer.first().textContent()) ?? "").trim();
      if (t.length > 0 && firstTokenMs == null) { firstTokenMs = Date.now() - t0; log("first answer token", { ms: firstTokenMs, preview: t.slice(0, 60) }); }
      text = t;
    }
    const streaming = await page.getByTestId("assistant-streaming").count();
    if (firstTokenMs != null && streaming === 0 && text.length > 0) break;
    await page.waitForTimeout(300);
  }
  const totalMs = Date.now() - t0;
  log("turn settled", { firstTokenMs, totalMs, chars: text.length, preview: text.slice(0, 240) });
  appendLatency({ project: ti.project.name, test: ti.title, question, firstTokenMs, totalMs, answerChars: text.length });
  return { firstTokenMs, totalMs, text };
}
type ArtifactRow = { id: string; name: string; kind?: string; source?: string; originEvent?: string | null; contentUrl?: string };
async function listArtifacts(request: APIRequestContext): Promise<ArtifactRow[]> {
  const r = await request.get("/api/artifacts?limit=200", { timeout: 30_000 });
  if (!r.ok()) return [];
  return ((await r.json()) as { data?: ArtifactRow[] }).data ?? [];
}
async function waitForArtifact(request: APIRequestContext, name: string, timeout = 60_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const hit = (await listArtifacts(request)).find((a) => a.name === name);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}
const artifactItems = (page: Page) => page.locator('[data-testid="artifacts-list"] [data-testid="artifact-item"], [data-testid="artifacts-page"] [data-testid="artifact-item"]');
const artifactItem = (page: Page, name: string) => artifactItems(page).filter({ hasText: name }).first();
async function openArtifactsPage(page: Page) {
  await page.goto("/artifacts?skip=1", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-testid="artifacts-page"], [data-testid="artifacts-list"]').first()).toBeVisible({ timeout: 60_000 });
}
const noHorizontalOverflow = (page: Page) => page.evaluate(() => (document.scrollingElement ?? document.documentElement).scrollWidth <= window.innerWidth + 1);
async function assertNoOverflow(page: Page, ti: TestInfo, where: string) {
  if (vpTag(page) !== "390x844") return;
  const ok = await noHorizontalOverflow(page);
  logger(ti, page)("mobile overflow check", { where, ok });
  expect(ok, `no horizontal overflow on ${where} at 390×844`).toBe(true);
}
async function isRed(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((el) => {
    const parse = (c: string) => { const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/); return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : +m[4] } : null; };
    const red = (c: string | null) => { const v = c ? parse(c) : null; return !!v && v.a > 0 && v.r >= 150 && v.r > v.g + 50 && v.r > v.b + 50; };
    const nodes = [el, ...Array.from(el.querySelectorAll<HTMLElement>("*"))].slice(0, 30);
    const colours = nodes.map((n) => { const cs = getComputedStyle(n); return [cs.color, cs.borderColor, cs.backgroundColor, cs.outlineColor]; }).flat();
    return { red: colours.some((c) => red(c)), exact: colours.some((c) => /239,\s*68,\s*68/.test(c)), cls: el.className };
  });
}
/** Re-open the most recent thread after a reload (welcome list or Threads menu); returns whether the user message with `name` came back. */
async function reopenThread(page: Page, ti: TestInfo, name: string) {
  const log = logger(ti, page);
  const sentChip = page.locator('[data-testid="message-attachments"] [data-testid="message-attachment"]').filter({ hasText: name });
  let there = await sentChip.first().waitFor({ timeout: 5_000 }).then(() => true).catch(() => false);
  if (there) return true;
  const welcome = page.locator('[data-testid="welcome-recent"] button');
  const menu = page.getByTestId("threads-menu");
  if (!(await welcome.count()) && (await menu.count())) await menu.locator("summary").click().catch(() => undefined);
  // Prefer the visible welcome list; the Threads <details> items precede it in DOM order and are hidden while the menu is closed.
  const btn = (await welcome.count()) ? welcome.first() : page.locator('[data-testid="threads-menu"] .oiu-threads__item').first();
  const label = await btn.textContent().catch(() => null);
  const reopened = await btn.waitFor({ state: "visible", timeout: 10_000 }).then(async () => { await btn.click(); return true; }).catch(() => false);
  log("reopen most recent thread", { reopened, label, welcomeButtons: await welcome.count(), menuPresent: await menu.count() });
  there = await sentChip.first().waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
  return there;
}

test.describe.serial("Evidence suite", () => {
  test("T1 document upload → chip ready → grounded answer cites the file → artifact listed with source upload", async ({ page, request }, ti) => {
    test.setTimeout(420_000);
    const log = logger(ti, page);
    log("START T1", { file: PDF_NAME, bytes: fs.statSync(PDF).size, at: iso() });
    await openChat(page); log("chat open"); await shot(page, ti, "t1-0-chat");
    await assertNoOverflow(page, ti, "/chat");
    const up = await attachAndWaitReady(page, ti, PDF, 180_000);
    await shot(page, ti, "t1-1-chip-ready");
    expect(up.status, `chip reaches ready (got ${up.status} code=${up.code}: ${up.text})`).toBe("ready");
    const turn = await askAndWait(page, ti, "What is the title of the attached document? One sentence, cite the file name.");
    const bubble = page.getByTestId("user-message").last();
    const sentChip = bubble.locator('[data-testid="message-attachments"] [data-testid="message-attachment"]').filter({ hasText: PDF_NAME });
    await expect(sentChip.first(), "user bubble shows the attachment chip").toBeVisible({ timeout: 20_000 });
    log("user bubble shows attachment chip", { name: PDF_NAME });
    await shot(page, ti, "t1-2-answer");
    expect(turn.firstTokenMs, "answer-block text arrived within 200 s").not.toBeNull();
    expect(turn.text.length, "answer length > 40").toBeGreaterThan(40);
    const mentions = /submit.?query/i.test(turn.text) || turn.text.toLowerCase().includes(PDF_NAME.toLowerCase()) || turn.text.toLowerCase().includes("submit-query-v1-sse-reference");
    log("answer mentions title/file", { mentions, firstTokenMs: turn.firstTokenMs });
    expect(mentions, `answer mentions "Submit Query" or ${PDF_NAME}`).toBe(true);
    const art = await waitForArtifact(request, PDF_NAME, 60_000);
    log("artifact lookup", { found: !!art, id: art?.id, source: art?.source, originEvent: art?.originEvent });
    expect(art, `GET /api/artifacts?limit=200 lists ${PDF_NAME}`).not.toBeNull();
    expect(art!.source === "upload" || art!.originEvent === "upload", `artifact source is upload (source=${art!.source} originEvent=${art!.originEvent})`).toBe(true);
    log("END T1");
  });

  test("T2+T3 image upload → thumb in chip → answer → message-images grid → lightbox + side-pane preview", async ({ page }, ti) => {
    test.setTimeout(420_000);
    const log = logger(ti, page);
    log("START T2", { file: IMG_NAME });
    await openChat(page);
    const up = await attachAndWaitReady(page, ti, IMG, 120_000);
    expect(up.status, `image chip reaches ready (got ${up.status} code=${up.code}: ${up.text})`).toBe("ready");
    const thumb = up.chip.getByTestId("attachment-thumb");
    const thumbOk = await thumb.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
    log("composer chip thumbnail", { visible: thumbOk });
    await shot(page, ti, "t2-1-chip-thumb");
    if (!thumbOk) gap(ti, "attachment-thumb", "no thumbnail rendered inside the ready image chip");
    const turn = await askAndWait(page, ti, "What kind of chart is attached? One sentence.");
    const grid = page.getByTestId("message-images").last();
    await expect(grid, "message-images grid under the sent message").toBeVisible({ timeout: 20_000 });
    await expect(grid.locator("img").first()).toBeVisible({ timeout: 10_000 });
    log("message-images grid visible");
    await shot(page, ti, "t2-2-answer");
    expect(turn.firstTokenMs, "answer-block text arrived within 200 s").not.toBeNull();
    const ok = /(bar|chart|graph|column)/i.test(turn.text);
    log("answer mentions bar/chart", { ok, firstTokenMs: turn.firstTokenMs });
    expect(ok, "answer mentions bar/chart").toBe(true);
    // ---- T3 image preview
    log("START T3 (image preview)");
    const tile = grid.locator('[data-testid="image-grid-tile"], [data-testid="image-thumb"]').first();
    await tile.click();
    const lightbox = page.getByTestId("lightbox");
    await expect(lightbox, "lightbox opens on tile click").toBeVisible({ timeout: 10_000 });
    await expect(lightbox.locator("img").first()).toBeVisible();
    log("lightbox visible"); await shot(page, ti, "t3-1-lightbox");
    await page.keyboard.press("Escape");
    await expect(lightbox, "Escape closes the lightbox").toBeHidden({ timeout: 10_000 });
    log("lightbox closed with Escape");
    await tile.click();
    await expect(lightbox).toBeVisible({ timeout: 10_000 });
    const toPane = page.getByTestId("lightbox-side-pane");
    if (await toPane.count()) {
      await toPane.click();
      const pane = page.locator('[data-testid="side-pane"][data-kind="image"]');
      await expect(pane, "side-pane[data-kind=image] opens from the lightbox").toBeVisible({ timeout: 10_000 });
      await expect(pane.getByTestId("side-pane-image")).toBeVisible({ timeout: 10_000 });
      log("side pane (image) visible"); await shot(page, ti, "t3-2-side-pane");
      await assertNoOverflow(page, ti, "/chat with side pane");
      await pane.getByTestId("side-pane-close").click();
      await expect(pane).toBeHidden({ timeout: 10_000 });
      log("side pane closed");
    } else {
      await page.keyboard.press("Escape");
      gap(ti, "lightbox-side-pane", "no 'Open in side pane' button in the lightbox");
    }
    log("END T2+T3");
  });

  test("T4 reload persistence → /artifacts lists both files (hard) → thread re-open on /chat (soft)", async ({ page }, ti) => {
    const log = logger(ti, page);
    log("START T4");
    await openChat(page);
    log("reload /chat"); await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 60_000 });
    await shot(page, ti, "t4-0-after-reload");
    await openArtifactsPage(page);
    await expect(artifactItem(page, PDF_NAME), `/artifacts lists ${PDF_NAME} after reload`).toBeVisible({ timeout: 30_000 });
    await expect(artifactItem(page, IMG_NAME), `/artifacts lists ${IMG_NAME} after reload`).toBeVisible({ timeout: 30_000 });
    const count = await artifactItems(page).count();
    log("/artifacts after reload", { items: count, pdf: true, image: true });
    expect(count, "artifact-item count ≥ 2").toBeGreaterThanOrEqual(2);
    await shot(page, ti, "t4-1-artifacts");
    await assertNoOverflow(page, ti, "/artifacts");
    await page.goto("/chat?skip=1", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 60_000 });
    const back = await reopenThread(page, ti, IMG_NAME);
    const ls = await page.evaluate(() => { const keys = Object.keys(localStorage); return { threads: keys.includes("bcap.chat.threads.v2") ? (JSON.parse(localStorage.getItem("bcap.chat.threads.v2") || "[]") as unknown[]).length : -1, msgKeys: keys.filter((k) => k.startsWith("bcap.chat.thread.v2.")).length, attKeys: keys.filter((k) => k.startsWith("bcap.chat.attachments.v1.")).length }; });
    log("thread re-open after reload", { userMessageWithChipVisible: back, localStorage: ls });
    await shot(page, ti, "t4-2-chat-reopened");
    // Known gap: annotated (not asserted) — the /artifacts listing above is the hard persistence assertion for this test.
    if (!back) knownGap(ti, "thread re-open after reload (known)", `the previous thread could not be re-opened from welcome-recent/threads-menu, so the user message with its attachment chip is not visible; localStorage threads=${ls.threads} messageKeys=${ls.msgKeys} attachmentKeys=${ls.attKeys}`);
    await assertNoOverflow(page, ti, "/chat");
    log("END T4");
  });

  test("T5 download → PDF bytes (download event | new tab | request.get fallback), 200 application/pdf starting with %PDF", async ({ page, context, request }, ti) => {
    test.skip(ti.project.name.includes("mobile"), "T5 runs on the desktop project only (T8 = mobile re-runs T1–T4)");
    const log = logger(ti, page);
    log("START T5");
    await openArtifactsPage(page);
    const item = artifactItem(page, PDF_NAME);
    await expect(item).toBeVisible({ timeout: 30_000 });
    const btn = item.getByTestId("artifact-download");
    await expect(btn).toBeEnabled({ timeout: 15_000 });
    const signed = page.waitForResponse((r) => /\/api\/artifacts\/[^/]+\/signed-url/.test(r.url()), { timeout: 30_000 }).catch(() => null);
    const dl = page.waitForEvent("download", { timeout: 20_000 }).then((d) => ({ kind: "download" as const, d })).catch(() => null);
    const popup = context.waitForEvent("page", { timeout: 20_000 }).then((p) => ({ kind: "page" as const, p })).catch(() => null);
    await btn.click(); log("artifact-download clicked");
    const sres = await signed;
    const sbody = sres ? ((await sres.json().catch(() => null)) as { data?: { url?: string; source?: string } } | null) : null;
    log("signed-url response", { status: sres?.status(), url: sbody?.data?.url?.slice(0, 120), source: sbody?.data?.source });
    const ev = await Promise.race([dl, popup, new Promise<null>((r) => setTimeout(() => r(null), 21_000))]);
    let usedPath = "request.get"; let url: string | null = sbody?.data?.url ?? null;
    let head: string | null = null; let status: number | null = null; let ctype: string | null = null;
    if (ev && ev.kind === "download") {
      usedPath = "page download event"; url = ev.d.url();
      const buf = await readDownload(ev.d);
      head = buf ? buf.subarray(0, 5).toString("latin1") : null;
      log("download event", { url: url.slice(0, 160), suggested: ev.d.suggestedFilename(), bytes: buf?.length, head });
    } else if (ev && ev.kind === "page") {
      usedPath = "new tab (context page event)";
      await ev.p.waitForLoadState("domcontentloaded").catch(() => undefined);
      url = ev.p.url(); log("new tab opened", { url: url.slice(0, 160) });
      await ev.p.close().catch(() => undefined);
    }
    if (!url || url === "about:blank") { const art = await waitForArtifact(request, PDF_NAME, 10_000); url = art?.contentUrl ?? (art ? `/api/artifacts/${art.id}/content?download=1` : null); }
    expect(url, "a download url was observed").not.toBeNull();
    const abs = url!.startsWith("http") ? url! : new URL(url!, ti.project.use.baseURL as string).toString();
    const r = await request.get(abs, { timeout: 60_000 });
    status = r.status(); ctype = r.headers()["content-type"] ?? null;
    const body = await r.body();
    const bodyHead = body.subarray(0, 5).toString("latin1");
    log("download verification", { path: usedPath, url: abs.slice(0, 160), status, contentType: ctype, bytes: body.length, head: bodyHead, disposition: r.headers()["content-disposition"] });
    ti.annotations.push({ type: "download-path", description: `${usedPath} → ${status} ${ctype} ${body.length} B` });
    expect(status, "download url answers 200").toBe(200);
    expect(ctype ?? "", "content-type application/pdf").toMatch(/application\/pdf/);
    expect(bodyHead, "body starts with %PDF").toMatch(/^%PDF/);
    if (head) expect(head, "download-event bytes start with %PDF").toMatch(/^%PDF/);
    await shot(page, ti, "t5-1-after-download");
    log("END T5");
  });

  test("T6 video preview → relay allow-list, backend ingest auth, no inline autoplay video, poster/play or icon fallback", async ({ page, request }, ti) => {
    test.skip(ti.project.name.includes("mobile"), "T6 runs on the desktop project only");
    const log = logger(ti, page);
    log("START T6", { mp4Bytes: fs.statSync(MP4).size });
    const relay = await request.post("/api/media", { multipart: { externalUserId: "INV-001", file: { name: "sample-video.mp4", mimeType: "video/mp4", buffer: fs.readFileSync(MP4) } }, timeout: 60_000 });
    const relayBody = await relay.text();
    log("POST /api/media sample-video.mp4", { status: relay.status(), body: relayBody.slice(0, 300) });
    let videoArtifactName: string | null = null;
    if (relay.status() === 400) {
      const j = JSON.parse(relayBody) as { code?: string; allowed?: string[] };
      finding(ti, "video upload", `video upload not allowed by relay (${j.code}; allowed: ${(j.allowed ?? []).join(", ")})`);
      const be = await request.post(`${API_URL}/artifacts`, { multipart: { externalUserId: "INV-001", file: { name: "sample-video.mp4", mimeType: "video/mp4", buffer: fs.readFileSync(MP4) } }, timeout: 60_000 });
      log("POST backend /artifacts (no X-Ingest-Secret)", { status: be.status(), body: (await be.text()).slice(0, 200) });
      finding(ti, "backend ingest", `POST ${API_URL}/artifacts without X-Ingest-Secret → ${be.status()} (expected 401/403 — the suite does not hold the secret)`);
      expect([401, 403], "backend rejects unauthenticated artifact ingest").toContain(be.status());
    } else if (relay.ok()) {
      videoArtifactName = "sample-video.mp4";
      finding(ti, "video upload", `relay accepted the mp4 (${relay.status()})`);
    } else {
      finding(ti, "video upload", `relay answered ${relay.status()}: ${relayBody.slice(0, 120)}`);
    }
    // UI: no inline autoplay <video> in the stream anywhere
    await openArtifactsPage(page);
    const autoplayArtifacts = await page.locator("video[autoplay]").count();
    const inlineVideoArtifacts = await page.locator('[data-testid="artifacts-list"] video[controls], [data-testid="artifacts-page"] video[controls]').count();
    log("/artifacts inline video check", { autoplay: autoplayArtifacts, inlineControls: inlineVideoArtifacts });
    expect(autoplayArtifacts, "no video[autoplay] on /artifacts").toBe(0);
    expect(inlineVideoArtifacts, "no <video controls> playing inline in the /artifacts list").toBe(0);
    const videoCards = page.locator('[data-testid="artifact-card"][data-kind="video"]');
    const nVideo = await videoCards.count();
    log("video artifacts on /artifacts", { count: nVideo, uploaded: videoArtifactName });
    if (nVideo > 0) {
      const card = videoCards.first();
      const poster = page.locator('[data-testid="video-poster"]');
      const play = page.locator('[data-testid="video-play"]');
      if ((await poster.count()) && (await play.count())) {
        log("video-poster + video-play rendered");
        await play.first().click();
      } else {
        finding(ti, "video card", "artifact card for kind video has no video-poster/video-play inline (opens via artifact-open-pane)");
        await card.getByTestId("artifact-open-pane").click();
      }
      const pane = page.locator('[data-testid="side-pane"][data-kind="video"]');
      await expect(pane, "side-pane[data-kind=video] opens").toBeVisible({ timeout: 15_000 });
      await expect(pane.locator("video[controls]"), "pane holds a <video controls>").toBeAttached({ timeout: 15_000 });
      await shot(page, ti, "t6-1-video-pane");
      await pane.getByTestId("side-pane-close").click();
    } else {
      const icon = await request.get("/icons/artifacts/video.png");
      const webp = await request.get("/assets/artifacts/video-256.webp");
      log("video icon fallback", { png: icon.status(), webp: webp.status() });
      expect(icon.status(), "/icons/artifacts/video.png → 200").toBe(200);
      expect(webp.status(), "/assets/artifacts/video-256.webp → 200").toBe(200);
      ti.annotations.push({ type: "app-gap", description: "no video artifact reachable — the relay allow-list rejects mp4 and the backend ingest needs X-Ingest-Secret; fallback icon verified for kind video via iconFor (/icons/artifacts/video.png + /assets/artifacts/video-256.webp both 200). side-pane[data-kind=video] + <video controls> could NOT be exercised end-to-end." });
    }
    await shot(page, ti, "t6-0-artifacts");
    await openChat(page);
    const autoplayChat = await page.locator("video[autoplay]").count();
    const inlineChat = await page.locator('[data-testid="run-view"] video[controls], [data-testid="user-message"] video[controls]').count();
    log("/chat inline video check", { autoplay: autoplayChat, inlineControls: inlineChat });
    expect(autoplayChat, "no video[autoplay] on /chat").toBe(0);
    expect(inlineChat, "no <video controls> inline in the chat stream").toBe(0);
    log("END T6");
  });

  test("T7 upload failure + retry → .exe error chip (red) → remove → 503 mock error + retry → unroute → retry → ready", async ({ page }, ti) => {
    test.skip(ti.project.name.includes("mobile"), "T7 runs on the desktop project only");
    const log = logger(ti, page);
    log("START T7");
    await openChat(page);
    await page.getByTestId("attachment-input").setInputFiles({ name: "tool.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ not really an executable") });
    const chip = page.getByTestId("attachment-chip").first();
    await expect(chip).toBeAttached({ timeout: 15_000 });
    await expect(chip, ".exe chip → data-status=error").toHaveAttribute("data-status", "error", { timeout: 30_000 });
    const red = await isRed(page, '[data-testid="attachment-chip"][data-status="error"]');
    log(".exe error chip", { text: (await chip.innerText()).replace(/\s+/g, " ").slice(0, 160), code: await chip.getAttribute("data-code"), red });
    expect(red.red || red.exact || /error/i.test(red.cls), "error chip is red (rgb 239,68,68 family) or carries an error class").toBe(true);
    await shot(page, ti, "t7-1-exe-error");
    await chip.getByTestId("attachment-remove").click();
    await expect(page.getByTestId("attachment-chip")).toHaveCount(0, { timeout: 10_000 });
    log(".exe chip removed");
    let failed = 0;
    await page.route("**/api/media", async (route) => {
      if (route.request().method() !== "POST" || failed >= 1) return route.fallback();
      failed += 1; log("relay POST intercepted → 503", { call: failed });
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, code: "upstream_unavailable", message: "Upload service unavailable — retry" }) });
    });
    await page.getByTestId("attachment-input").setInputFiles(IMG);
    const chip2 = page.getByTestId("attachment-chip").first();
    await expect(chip2, "503 → chip error").toHaveAttribute("data-status", "error", { timeout: 30_000 });
    const retry = chip2.getByTestId("attachment-retry");
    await expect(retry, "attachment-retry visible on the retryable failure").toBeVisible({ timeout: 10_000 });
    log("retryable error chip", { text: (await chip2.innerText()).replace(/\s+/g, " ").slice(0, 160), red: await isRed(page, '[data-testid="attachment-chip"][data-status="error"]') });
    await shot(page, ti, "t7-2-503-error-retry");
    await page.unroute("**/api/media"); log("unrouted /api/media");
    await retry.click(); log("retry clicked");
    await expect(chip2, "retry → chip ready").toHaveAttribute("data-status", "ready", { timeout: 120_000 });
    log("chip ready after retry", { code: await chip2.getAttribute("data-code") });
    await shot(page, ti, "t7-3-retry-ready");
    await chip2.getByTestId("attachment-remove").click();
    await expect(page.getByTestId("attachment-chip")).toHaveCount(0, { timeout: 10_000 });
    log("END T7");
  });
});

async function readDownload(d: Download): Promise<Buffer | null> {
  try {
    const p = await d.path();
    if (p) return fs.readFileSync(p);
    const s = await d.createReadStream();
    if (!s) return null;
    const chunks: Buffer[] = [];
    for await (const c of s) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    return Buffer.concat(chunks);
  } catch { return null; }
}

test.afterAll(() => { console.log(`[${iso()}] evidence written under ${OUT}`); });
