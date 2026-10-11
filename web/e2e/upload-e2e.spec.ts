import { test as base, expect, type Page, type TestInfo, type APIRequestContext, type Download } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { primeSettings, isAllowed } from "./helpers";

/**
 * upload-e2e (turn 4, unit 4b) — PDF + PNG paperclip upload → Artifacts page shows both as source "input" with the right icons, and the
 * filter-chip counters move by the expected deltas (all +2, documents +1, images +1, uploads +2; asserted as ">=" so concurrent artifacts
 * from other suites cannot break the run). Then the PDF is downloaded via `artifact-download` and the bytes must start with %PDF.
 * Runs at 1440×900 (evidence-desktop) and 390×844 (evidence-mobile); each describe is serial; every test is capped at 240 s.
 * Every step logs an ISO-UTC line to proof/evidence/upload-e2e-log.ndjson. No application source is touched.
 */
const OUT = path.resolve(__dirname, "../proof/evidence");
const LOG = path.join(OUT, "upload-e2e-log.ndjson");
fs.mkdirSync(OUT, { recursive: true });
const FIX = path.resolve(__dirname, "../tests/fixtures");
const PDF = path.resolve(__dirname, "../../docs/reference/submit-query-v1-sse-reference.pdf");
const PDF_NAME = path.basename(PDF);
const IMG = path.join(FIX, "bar-chart.png");
const IMG_NAME = path.basename(IMG);
const COUNTERS = ["all", "document", "image", "upload"] as const;
type CounterId = (typeof COUNTERS)[number];
type Counters = Record<CounterId, number | null>;
const EXPECTED_DELTA: Counters = { all: 2, document: 1, image: 1, upload: 2 };

const iso = () => new Date().toISOString();
const vpTag = (page: Page) => ((page.viewportSize()?.width ?? 1440) <= 500 ? "390x844" : "1440x900");
function logger(ti: TestInfo, page?: Page) {
  return (action: string, extra: Record<string, unknown> = {}) => {
    const line = { at: iso(), suite: "upload-e2e", project: ti.project.name, viewport: page ? vpTag(page) : ti.project.name, test: ti.title, action, ...extra };
    console.log(`[${line.at}] [${ti.project.name}] ${action}${Object.keys(extra).length ? " " + JSON.stringify(extra) : ""}`);
    try { fs.appendFileSync(LOG, JSON.stringify(line) + "\n"); } catch { /* best effort */ }
  };
}
async function shot(page: Page, ti: TestInfo, name: string) {
  const p = ti.outputPath(`${name}.png`);
  await page.screenshot({ path: p, fullPage: false }).catch(() => undefined);
  await ti.attach(name, { path: p, contentType: "image/png" }).catch(() => undefined);
}

const EXTRA_ALLOW = [/ResizeObserver loop/i];
const allowed = (m: string) => isAllowed(m) || EXTRA_ALLOW.some((re) => re.test(m));
/** localStorage carried between the serial tests of one project (threads/attachments live in localStorage; each test gets a fresh context). */
const carried: Record<string, Record<string, string>> = {};
/** Counter baseline read at the start of the flow, per project. */
const baseline: Record<string, Counters> = {};

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

async function openArtifactsPage(page: Page) {
  await page.goto("/artifacts?skip=1", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-testid="artifacts-page"], [data-testid="artifacts-list"]').first()).toBeVisible({ timeout: 60_000 });
  // wait for the first load to settle so the counters are not read while "Loading artifacts…"
  await page.locator('[data-testid="artifacts-list"] .art-note[role="status"]').first().waitFor({ state: "hidden", timeout: 30_000 }).catch(() => undefined);
}
async function readCounters(page: Page, ti: TestInfo): Promise<Counters> {
  const log = logger(ti, page);
  const out = {} as Counters;
  for (const id of COUNTERS) {
    const chip = page.getByTestId(`artifact-filter-${id}`);
    if ((await chip.count()) === 0) { out[id] = null; log("counter chip missing → n/a", { id }); continue; }
    const n = chip.locator(".art-chip-n");
    if ((await n.count()) === 0) { out[id] = null; log("counter span missing → n/a", { id }); continue; }
    const txt = ((await n.first().textContent()) ?? "").trim();
    const v = Number.parseInt(txt, 10);
    out[id] = Number.isFinite(v) ? v : null;
  }
  log("counters read", { ...out });
  return out;
}
const artifactItems = (page: Page) => page.locator('[data-testid="artifacts-list"] [data-testid="artifact-item"], [data-testid="artifacts-page"] [data-testid="artifact-item"]');
const artifactItem = (page: Page, name: string) => artifactItems(page).filter({ hasText: name }).first();

async function openChat(page: Page) {
  await page.goto("/chat?skip=1", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("attachment-input")).toBeAttached({ timeout: 30_000 });
}
async function attachAndWaitReady(page: Page, ti: TestInfo, file: string, timeout = 90_000) {
  const log = logger(ti, page);
  const name = path.basename(file);
  const before = await page.getByTestId("attachment-chip").count();
  log("attach file", { name, sizeBytes: fs.statSync(file).size });
  const t0 = Date.now();
  await page.getByTestId("attachment-input").setInputFiles(file);
  const chip = page.getByTestId("attachment-chip").nth(before);
  await expect(chip).toBeAttached({ timeout: 15_000 });
  await expect(chip).toContainText(name);
  log("chip created", { name, status: await chip.getAttribute("data-status") });
  await expect(chip).toHaveAttribute("data-status", /^(ready|error)$/, { timeout });
  const status = await chip.getAttribute("data-status");
  const info = { name, status, code: await chip.getAttribute("data-code"), kind: await chip.getAttribute("data-kind"), ms: Date.now() - t0, text: (await chip.innerText()).replace(/\s+/g, " ").trim().slice(0, 160) };
  log("chip settled", info);
  return { chip, ...info };
}
type ArtifactRow = { id: string; name: string; kind?: string; source?: string; originEvent?: string | null; contentUrl?: string; threadId?: string | null };
async function listArtifacts(request: APIRequestContext): Promise<ArtifactRow[]> {
  const r = await request.get("/api/artifacts?limit=200", { timeout: 30_000 });
  if (!r.ok()) return [];
  return ((await r.json()) as { data?: ArtifactRow[] }).data ?? [];
}
async function waitForUploadArtifacts(request: APIRequestContext, names: string[], timeout = 60_000) {
  const t0 = Date.now();
  let found: Record<string, ArtifactRow | undefined> = {};
  while (Date.now() - t0 < timeout) {
    const all = await listArtifacts(request);
    found = Object.fromEntries(names.map((n) => [n, all.find((a) => a.name === n && (a.source === "upload" || a.originEvent === "upload"))]));
    if (names.every((n) => found[n])) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return { found, ms: Date.now() - t0 };
}
async function sendShortTurn(page: Page, ti: TestInfo, question: string, deadline: number) {
  const log = logger(ti, page);
  const runsBefore = await page.getByTestId("run-view").count();
  await page.getByTestId("composer-input").fill(question);
  await expect(page.getByTestId("composer-send")).toBeEnabled({ timeout: 30_000 });
  const t0 = Date.now(); log("send click", { question });
  await page.getByTestId("composer-send").click();
  const answer = page.getByTestId("run-view").nth(runsBefore).getByTestId("answer-block");
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
  log("turn settled", { firstTokenMs, totalMs, chars: text.length, preview: text.slice(0, 200) });
  return { firstTokenMs, totalMs, text };
}
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

for (const vp of ["1440x900", "390x844"] as const) {
  test.describe.serial(`upload-e2e @${vp}`, () => {
    test.skip(({ viewport }) => `${viewport?.width ?? 1440}x${viewport?.height ?? 900}` !== vp, `this describe is the ${vp} half`);

    test(`U1 counters baseline → PDF+PNG paperclip upload → chips ready → artifacts persisted (source upload) → one short chat turn [${vp}]`, async ({ page, request }, ti) => {
      test.setTimeout(240_000);
      const log = logger(ti, page);
      log("START U1", { pdf: PDF_NAME, pdfBytes: fs.statSync(PDF).size, png: IMG_NAME, pngBytes: fs.statSync(IMG).size });
      await openArtifactsPage(page);
      baseline[ti.project.name] = await readCounters(page, ti);
      await shot(page, ti, "u1-0-artifacts-baseline");
      await openChat(page); log("chat open");
      const a = await attachAndWaitReady(page, ti, PDF);
      const b = await attachAndWaitReady(page, ti, IMG);
      await shot(page, ti, "u1-1-chips-ready");
      expect(a.status, `PDF chip reaches ready (got ${a.status} code=${a.code}: ${a.text})`).toBe("ready");
      expect(b.status, `PNG chip reaches ready (got ${b.status} code=${b.code}: ${b.text})`).toBe("ready");
      const { found, ms } = await waitForUploadArtifacts(request, [PDF_NAME, IMG_NAME], 60_000);
      log("artifacts persisted at upload time", { ms, pdf: found[PDF_NAME] ? { id: found[PDF_NAME]!.id, kind: found[PDF_NAME]!.kind, source: found[PDF_NAME]!.source } : null, png: found[IMG_NAME] ? { id: found[IMG_NAME]!.id, kind: found[IMG_NAME]!.kind, source: found[IMG_NAME]!.source } : null });
      expect(found[PDF_NAME], `/api/artifacts lists ${PDF_NAME} with source upload within 60 s`).toBeTruthy();
      expect(found[IMG_NAME], `/api/artifacts lists ${IMG_NAME} with source upload within 60 s`).toBeTruthy();
      // One short turn so the files are tied to a thread (bounded; the persistence assertions above are the hard ones).
      const turn = await sendShortTurn(page, ti, "List the two attached files by name in one sentence.", 120_000);
      await shot(page, ti, "u1-2-after-turn");
      if (turn.firstTokenMs == null) ti.annotations.push({ type: "app-finding", description: `answer-block did not arrive within 120 s (turn kept short on purpose; uploads were already persisted)` });
      expect.soft(turn.firstTokenMs, "answer-block text arrived within 120 s").not.toBeNull();
      log("END U1");
    });

    test(`U2 /artifacts lists both as "input", PDF icon pdf / PNG icon image|chart, counters +2/+1/+1/+2, PDF download starts with %PDF [${vp}]`, async ({ page, request }, ti) => {
      test.setTimeout(240_000);
      const log = logger(ti, page);
      log("START U2");
      const before = baseline[ti.project.name];
      expect(before, "U1 recorded the counter baseline").toBeTruthy();
      await openArtifactsPage(page);
      const pdfItem = artifactItem(page, PDF_NAME);
      const pngItem = artifactItem(page, IMG_NAME);
      await expect(pdfItem, `artifact-item for ${PDF_NAME}`).toBeVisible({ timeout: 30_000 });
      await expect(pngItem, `artifact-item for ${IMG_NAME}`).toBeVisible({ timeout: 30_000 });
      await shot(page, ti, "u2-0-artifacts");
      const pdfSrc = ((await pdfItem.getByTestId("artifact-source").first().textContent()) ?? "").trim();
      const pngSrc = ((await pngItem.getByTestId("artifact-source").first().textContent()) ?? "").trim();
      const pdfIcon = await pdfItem.getByTestId("artifact-card").first().getAttribute("data-icon");
      const pngIcon = await pngItem.getByTestId("artifact-card").first().getAttribute("data-icon");
      const pdfKind = await pdfItem.getByTestId("artifact-card").first().getAttribute("data-kind");
      const pngKind = await pngItem.getByTestId("artifact-card").first().getAttribute("data-kind");
      log("cards", { pdf: { source: pdfSrc, icon: pdfIcon, kind: pdfKind }, png: { source: pngSrc, icon: pngIcon, kind: pngKind } });
      expect(pdfSrc, "PDF artifact-source text").toBe("input");
      expect(pngSrc, "PNG artifact-source text").toBe("input");
      expect(pdfIcon, "PDF card data-icon").toBe("pdf");
      // iconFor() returns "chart" for image names matching /chart|graph|plot/ (bar-chart.png) and "image" otherwise — both are the image glyph family.
      expect(pngIcon, "PNG card data-icon is image (or chart for a *chart*.png name)").toMatch(/^(image|chart)$/);
      const after = await readCounters(page, ti);
      const deltas: Record<string, number | "n/a"> = {};
      for (const id of COUNTERS) {
        const b0 = before[id]; const a0 = after[id];
        if (b0 == null || a0 == null) { deltas[id] = "n/a"; continue; }
        deltas[id] = a0 - b0;
        expect(a0, `counter ${id}: ${a0} ≥ ${b0} + ${EXPECTED_DELTA[id]}`).toBeGreaterThanOrEqual(b0 + EXPECTED_DELTA[id]);
      }
      log("counter deltas", { before, after, deltas, expectedMin: EXPECTED_DELTA });
      ti.annotations.push({ type: "counters", description: `before=${JSON.stringify(before)} after=${JSON.stringify(after)} deltas=${JSON.stringify(deltas)}` });
      // ---- download the PDF
      const btn = pdfItem.getByTestId("artifact-download").first();
      await btn.scrollIntoViewIfNeeded().catch(() => undefined);
      await expect(btn).toBeEnabled({ timeout: 15_000 });
      const signed = page.waitForResponse((r) => /\/api\/artifacts\/[^/]+\/signed-url/.test(r.url()), { timeout: 30_000 }).catch(() => null);
      const dl = page.waitForEvent("download", { timeout: 20_000 }).then((d) => ({ kind: "download" as const, d })).catch(() => null);
      const popup = page.context().waitForEvent("page", { timeout: 20_000 }).then((p) => ({ kind: "page" as const, p })).catch(() => null);
      await btn.click(); log("artifact-download clicked");
      const sres = await signed;
      const sbody = sres ? ((await sres.json().catch(() => null)) as { data?: { url?: string; source?: string } } | null) : null;
      log("signed-url response", { status: sres?.status(), url: sbody?.data?.url?.slice(0, 120), source: sbody?.data?.source });
      const ev = await Promise.race([dl, popup, new Promise<null>((r) => setTimeout(() => r(null), 21_000))]);
      let usedPath = "request.get"; let url: string | null = sbody?.data?.url ?? null; let head: string | null = null;
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
      if (!url || url === "about:blank") { const art = (await listArtifacts(request)).find((x) => x.name === PDF_NAME); url = art?.contentUrl ?? (art ? `/api/artifacts/${art.id}/content?download=1` : null); }
      expect(url, "a download url was observed").not.toBeNull();
      const abs = url!.startsWith("http") ? url! : new URL(url!, ti.project.use.baseURL as string).toString();
      const r = await request.get(abs, { timeout: 60_000 });
      const body = await r.body();
      const bodyHead = body.subarray(0, 5).toString("latin1");
      log("download verification", { path: usedPath, url: abs.slice(0, 160), status: r.status(), contentType: r.headers()["content-type"], bytes: body.length, head: bodyHead });
      ti.annotations.push({ type: "download-path", description: `${usedPath} → ${r.status()} ${r.headers()["content-type"]} ${body.length} B` });
      expect(r.status(), "download url answers 200").toBe(200);
      expect(bodyHead, "body starts with %PDF").toMatch(/^%PDF/);
      if (head) expect(head, "download-event bytes start with %PDF").toMatch(/^%PDF/);
      await shot(page, ti, "u2-1-after-download");
      log("END U2");
    });
  });
}

test.afterAll(() => { console.log(`[${iso()}] upload-e2e log at ${LOG}`); });
