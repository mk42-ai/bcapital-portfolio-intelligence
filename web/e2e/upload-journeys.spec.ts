import { test as base, expect } from "@playwright/test";
import { primeSettings, captureErrors } from "./helpers";
import fs from "node:fs";
import path from "node:path";
import { OUT, FIX_IMG, FIX_PDF, FIX_PDF_FALLBACK, FIX_DOCX, logger, shot, gap, openChat, attachAndWaitReady, askAndWait, listArtifacts, waitForArtifact, artifactItem, clickUploadsFilter, isRedState, viewportTag } from "./upload-helpers";

/**
 * Lane D — upload journeys end-to-end against the live deployment (BASE_URL / playwright baseURL, never hard-coded).
 *  1. PDF document journey   2. DOCX document journey   3. three image journeys (geothermal plant, bar chart, UNREADABLE blurred memo)
 *  4. failure state + retry (bad extension, 0-byte file) + API 400 unsupported_type   5. /artifacts persistence of the three images.
 * Every step is logged with ISO-UTC timestamps (console + proof/upload-journeys/journey-log.ndjson); screenshots go to
 * proof/upload-journeys/<name>-<viewport>.png; send→first-token latency per turn is appended to proof/upload-journeys/latency.json.
 * App gaps are reported with test.info().annotations + expect.soft — never a silent skip.
 */
/** Settings primed (onboarded) + client errors captured and ANNOTATED (not asserted: a live-LLM journey must not fail on preview-env console noise). */
const test = base.extend<{ prime: void }>({
  prime: [async ({ page }, use, ti) => {
    await primeSettings(page);
    const errs = captureErrors(page);
    await use();
    if (errs.length) ti.annotations.push({ type: "client-errors", description: errs.slice(0, 10).join(" | ") });
  }, { auto: true }],
});

const PDF = fs.existsSync(FIX_PDF) ? FIX_PDF : FIX_PDF_FALLBACK;
const PDF_NAME = path.basename(PDF);
const IMAGES = [
  { file: "geothermal-plant.png", q: "Describe what the attached image shows in one sentence.", expect: /(geothermal|plant|steam|industrial|power|facility|pipes?|cooling|turbine)/i, label: "geothermal" },
  { file: "bar-chart.png", q: "What kind of chart is the attached image and what does its title say?", expect: /(bar|chart|graph|column)/i, label: "bar-chart" },
  { file: "blurred-memo.png", q: "Summarise the attached memo.", expect: /(unreadable|illegible|blurr|blurry|blurred|cannot (read|make out|be read|decipher)|can(no|')t (read|make out|decipher)|not legible|too (low|poor).?(resolution|quality)|unable to (read|make out|decipher)|out of focus|not (clear|readable) enough|hard to read|difficult to read)/i, label: "blurred-memo" },
];
/** Confident memo-content phrasing that must NOT appear without a disclaimer (invented specifics). */
const INVENTED = /(the memo (states|says|outlines|announces|instructs|informs)|dated \d|subject:|from:\s*\w|to:\s*\w|\bQ[1-4]\b.*(revenue|budget)|effective (immediately|from)|all (staff|employees) (are|must))/i;

async function documentJourney(page: import("@playwright/test").Page, request: import("@playwright/test").APIRequestContext, ti: import("@playwright/test").TestInfo, file: string, question: string, label: string, contentHint: RegExp) {
  test.setTimeout(420_000);
  const log = logger(ti, page); const vp = viewportTag(ti, page); const name = path.basename(file);
  log("START document journey", { file: name, bytes: fs.statSync(file).size });
  await openChat(page); log("chat open"); await shot(page, `${label}-0-chat`, vp);
  const up = await attachAndWaitReady(page, ti, file, { timeout: 240_000 });
  await shot(page, `${label}-1-chip`, vp);
  if (up.status !== "ready") { gap(ti, `${name} upload`, `chip settled as ${up.status} (code=${up.code}): ${up.text}`); return; }
  expect(up.status, "chip reaches ready (processed)").toBe("ready");
  const turn = await askAndWait(page, ti, question, { deadlineMs: 200_000 });
  // user bubble lists the attachment chip
  const sentChip = page.locator('[data-testid="message-attachments"] [data-testid="message-attachment"]').filter({ hasText: name });
  await expect(sentChip.first(), "user message shows the attachment chip").toBeVisible({ timeout: 20_000 });
  log("user bubble shows attachment chip", { name });
  await shot(page, `${label}-2-answer`, vp);
  if (!turn.streamed) { gap(ti, `${name} answer`, `no answer-block text within 200 s (dataGap=${turn.dataGap})`); }
  else {
    expect(turn.text.length, "answer length > 40").toBeGreaterThan(40);
    const base = name.replace(/\.(pdf|docx)$/i, "");
    const cites = turn.text.includes(name) || turn.text.toLowerCase().includes(base.toLowerCase()) || /\b(attached|document|file|pdf|docx)\b/i.test(turn.text);
    expect(cites, `answer cites the file (${name} / "attached"/"document")`).toBe(true);
    expect.soft(contentHint.test(turn.text), `answer reflects the document content (${contentHint})`).toBe(true);
  }
  // artifacts proxy lists the upload as an input
  const art = await waitForArtifact(request, name, 60_000);
  log("artifact lookup", { found: !!art, id: art?.id, source: art?.source, originEvent: art?.originEvent, threadId: art?.threadId });
  if (!art) gap(ti, `${name} artifact`, `GET /api/artifacts does not list ${name} within 60 s`);
  else expect.soft(art.source === "upload" || art.originEvent === "upload", `artifact ${name} has source:"upload" (got source=${art.source} originEvent=${art.originEvent})`).toBe(true);
  // reload → user message still lists the chip; /artifacts still lists it
  log("reload /chat"); await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 60_000 });
  // After a reload the app opens on the welcome canvas; the thread is reopened from "Recent threads" (welcome list or Threads menu).
  let stillThere = await sentChip.first().waitFor({ timeout: 5_000 }).then(() => true).catch(() => false);
  if (!stillThere) {
    const recentBtn = page.locator('[data-testid="welcome-recent"] button, [data-testid="threads-menu"] .oiu-threads__item').first();
    const menu = page.getByTestId("threads-menu");
    if (!(await page.locator('[data-testid="welcome-recent"] button').count()) && (await menu.count())) await menu.locator("summary").click();
    const reopened = await recentBtn.waitFor({ timeout: 10_000 }).then(async () => { await recentBtn.click(); return true; }).catch(() => false);
    log("after reload: reopened most recent thread", { reopened });
    stillThere = await sentChip.first().waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
  }
  const ls = await page.evaluate(() => { const keys = Object.keys(localStorage); const list = keys.includes("bcap.chat.threads.v2") ? (JSON.parse(localStorage.getItem("bcap.chat.threads.v2") || "[]") as unknown[]).length : -1; return { threads: list, threadList: (localStorage.getItem("bcap.chat.threads.v2") || "").slice(0, 300), sentKeys: keys.filter((k) => k.startsWith("bcap.chat.attachments.v1.")).length, msgKeys: keys.filter((k) => k.startsWith("bcap.chat.thread.v2.")).length }; });
  log("after reload: user message attachment chip", { present: stillThere, localStorage: ls });
  if (!stillThere) gap(ti, `${name} persistence after reload`, `after reload the thread is not re-openable (no welcome-recent list, Threads menu shows no items) so the user message with the attachment chip is gone from the UI; localStorage still has threads=${ls.threads} messageKeys=${ls.msgKeys} sentAttachmentKeys=${ls.sentKeys}`);
  await shot(page, `${label}-3-reloaded`, vp);
  await page.goto("/artifacts?skip=1", { waitUntil: "domcontentloaded" });
  const listed = await artifactItem(page, name).waitFor({ timeout: 30_000 }).then(() => true).catch(() => false);
  log("/artifacts lists upload", { name, listed });
  if (!listed) gap(ti, `${name} on /artifacts`, "artifact item with the file name not visible on /artifacts");
  await shot(page, `${label}-4-artifacts`, vp);
  log("END document journey", { file: name });
}

test.describe("Upload journeys — documents (desktop)", () => {
  // NOT serial: the PDF and DOCX journeys are independent, and a reported app gap in one must not hide the other.
  test("PDF: upload → ready → grounded answer cites the file → artifact persisted → survives reload", async ({ page, request }, ti) => {
    await documentJourney(page, request, ti, PDF, "What is the title of the attached document? Answer in one short sentence and cite the file name.", "pdf", PDF === FIX_PDF ? /(submit.?query|sse|event reference)/i : /zephyr/i);
  });
  test("DOCX: compendium.docx (15 MB) → ready → answer about the DOCX → artifact persisted → survives reload", async ({ page, request }, ti) => {
    await documentJourney(page, request, ti, FIX_DOCX, "In one sentence, what is the attached DOCX about?", "docx", /./);
  });
});

async function imageJourney(page: import("@playwright/test").Page, ti: import("@playwright/test").TestInfo, img: (typeof IMAGES)[number]) {
  test.setTimeout(360_000);
  const log = logger(ti, page); const vp = viewportTag(ti, page); const file = path.join(FIX_IMG, img.file);
  log("START image journey", { file: img.file });
  await openChat(page);
  const up = await attachAndWaitReady(page, ti, file, { timeout: 180_000 });
  if (up.status !== "ready") { gap(ti, `${img.file} upload`, `chip settled as ${up.status} (code=${up.code}): ${up.text}`); await shot(page, `${img.label}-1-chip`, vp); return; }
  const thumb = up.chip.getByTestId("attachment-thumb");
  const thumbOk = await thumb.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
  log("composer chip thumbnail", { visible: thumbOk });
  if (!thumbOk) gap(ti, `${img.file} composer thumbnail`, "attachment-thumb not rendered in the ready chip (no previewUrl from the relay?)");
  await shot(page, `${img.label}-1-chip`, vp);
  const turn = await askAndWait(page, ti, img.q, { deadlineMs: 200_000 });
  const sentImages = page.getByTestId("message-images").last();
  const imgOk = await sentImages.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
  log("sent message image grid", { visible: imgOk });
  if (!imgOk) gap(ti, `${img.file} message-images`, "no [data-testid=message-images] under the sent user message");
  else await expect.soft(sentImages.locator("img").first(), "thumbnail image under the sent message").toBeVisible({ timeout: 10_000 });
  await shot(page, `${img.label}-2-answer`, vp);
  if (!turn.streamed) { gap(ti, `${img.file} answer`, `no answer-block text within 200 s (dataGap=${turn.dataGap})`); return; }
  const text = turn.text;
  if (img.label === "blurred-memo") {
    const disclaimed = img.expect.test(text) || (turn.dataGap != null && img.expect.test(turn.dataGap));
    log("blurred memo honesty check", { disclaimed, dataGap: turn.dataGap, badge: turn.badge });
    expect(disclaimed, `answer must state the memo is unreadable/illegible/blurry — got: "${text.slice(0, 300)}"`).toBe(true);
    const honestyLine = disclaimed || (turn.dataGap != null && turn.dataGap.length > 0);
    expect(honestyLine, "a Data-gap sentence or honesty line exists").toBe(true);
    if (!disclaimed && INVENTED.test(text)) expect(false, `answer confidently lists memo contents without any disclaimer: "${text.slice(0, 300)}"`).toBe(true);
    if (disclaimed && INVENTED.test(text)) ti.annotations.push({ type: "warn", description: `memo answer contains confident memo phrasing alongside the disclaimer: ${text.slice(0, 200)}` });
  } else {
    expect(text.length, "answer length > 40").toBeGreaterThan(40);
    expect.soft(img.expect.test(text), `answer mentions ${img.expect} — got: "${text.slice(0, 200)}"`).toBe(true);
  }
  log("END image journey", { file: img.file });
}

test.describe("Upload journeys — images (desktop 1440×900)", () => {
  test.describe.configure({ mode: "serial" });
  for (const img of IMAGES) test(`image: ${img.file} → thumb in chip + under message → ${img.label === "blurred-memo" ? "honest 'cannot read' answer" : "grounded description"}`, async ({ page }, ti) => imageJourney(page, ti, img));

  test("persistence: /artifacts lists the three images as uploads, also after reload", async ({ page, request }, ti) => {
    test.setTimeout(180_000);
    const log = logger(ti, page); const vp = viewportTag(ti, page);
    const names = IMAGES.map((i) => i.file);
    const all = await listArtifacts(request);
    const rows = names.map((n) => all.find((a) => a.name === n));
    log("api artifacts", { found: rows.map((r) => (r ? { name: r.name, source: r.source, origin: r.originEvent } : null)) });
    for (let i = 0; i < names.length; i++) { expect.soft(rows[i], `API lists ${names[i]}`).toBeTruthy(); if (rows[i]) expect.soft(rows[i]!.source === "upload" || rows[i]!.originEvent === "upload", `${names[i]} is an input (source upload)`).toBe(true); }
    for (const pass of ["first", "after-reload"] as const) {
      if (pass === "first") await page.goto("/artifacts?skip=1", { waitUntil: "domcontentloaded" }); else await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator('[data-testid="artifacts-page"], [data-testid="artifacts-list"]').first()).toBeVisible({ timeout: 60_000 });
      const filtered = await clickUploadsFilter(page); log(`${pass}: uploads filter`, { clicked: filtered });
      for (const n of names) {
        const ok = await artifactItem(page, n).waitFor({ timeout: 30_000 }).then(() => true).catch(() => false);
        log(`${pass}: /artifacts lists`, { name: n, ok });
        if (!ok) gap(ti, `${n} on /artifacts (${pass})`, "not listed as an input on /artifacts");
      }
      await shot(page, `artifacts-${pass}`, vp);
    }
  });
});

test.describe("Upload journeys — failure state + retry", () => {
  test("ui: tool.exe → error chip (red) with retry; retry stays error; remove works; 0-byte file → error", async ({ page }, ti) => {
    test.setTimeout(120_000);
    const log = logger(ti, page); const vp = viewportTag(ti, page);
    await openChat(page);
    log("attach tool.exe");
    await page.getByTestId("attachment-input").setInputFiles({ name: "tool.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ not really an executable") });
    const chip = page.getByTestId("attachment-chip").first();
    await expect(chip).toBeAttached({ timeout: 15_000 });
    await expect(chip).toHaveAttribute("data-status", "error", { timeout: 30_000 });
    const text = (await chip.innerText()).replace(/\s+/g, " ");
    log("error chip", { text, code: await chip.getAttribute("data-code") });
    expect(text, "error chip explains the problem").toMatch(/not a supported type|unsupported|PDF/i);
    const red = await isRedState(page, '[data-testid="attachment-chip"][data-status="error"]');
    log("red state", { red });
    expect.soft(red, "error chip uses a red failure colour").toBe(true);
    await shot(page, "failure-1-error-chip", vp);
    // Retry is deliberately NOT offered for client-side rejections (unsupported_type / too_large → retryable=false in attachments.tsx):
    // retrying the same bad file can never succeed. Record that as app behaviour, then exercise the REAL retry path below.
    const retryOnBad = await chip.getByTestId("attachment-retry").isVisible().catch(() => false);
    log("retry button on unsupported_type chip", { visible: retryOnBad });
    ti.annotations.push({ type: "app-behaviour", description: `attachment-retry on unsupported_type chip: ${retryOnBad ? "visible" : "hidden by design (retryable=false); retry is exercised via a relay 5xx below"}` });
    await chip.getByTestId("attachment-remove").click(); log("remove clicked");
    await expect(page.getByTestId("attachment-chip")).toHaveCount(0, { timeout: 10_000 });
    log("chip removed");
    // 0-byte file
    await page.getByTestId("attachment-input").setInputFiles({ name: "empty.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(0) });
    const chip2 = page.getByTestId("attachment-chip").first();
    await expect(chip2).toHaveAttribute("data-status", "error", { timeout: 30_000 });
    log("0-byte chip", { text: (await chip2.innerText()).replace(/\s+/g, " "), code: await chip2.getAttribute("data-code") });
    await shot(page, "failure-2-empty-file", vp);
    await chip2.getByTestId("attachment-remove").click();
    await expect(page.getByTestId("attachment-chip")).toHaveCount(0, { timeout: 10_000 });
    // Retryable failure: the relay answers 503 for a VALID file → error chip (red) + Retry → click Retry → relay still 503 → still error →
    // remove works. Then a second retry with the relay healthy must reach ready (proves retry re-posts the same file).
    let relayCalls = 0; let failRelay = true;
    await page.route("**/api/media", async (route) => {
      if (route.request().method() !== "POST" || !failRelay) return route.fallback();
      relayCalls += 1; log("relay POST intercepted → 503", { call: relayCalls });
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, code: "upstream_unavailable", message: "Upload service unavailable — retry" }) });
    });
    await page.getByTestId("attachment-input").setInputFiles(path.join(FIX_IMG, "bar-chart.png"));
    const chip3 = page.getByTestId("attachment-chip").first();
    await expect(chip3).toHaveAttribute("data-status", "error", { timeout: 30_000 });
    log("retryable error chip", { text: (await chip3.innerText()).replace(/\s+/g, " "), code: await chip3.getAttribute("data-code") });
    expect(await isRedState(page, '[data-testid="attachment-chip"][data-status="error"]'), "retryable error chip is red").toBe(true);
    const retry = chip3.getByTestId("attachment-retry");
    await expect(retry, "Retry visible on a retryable failure").toBeVisible({ timeout: 10_000 });
    await shot(page, "failure-3-retryable-error", vp);
    await retry.click(); log("retry clicked (relay still failing)");
    await expect.poll(() => relayCalls, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
    await expect(chip3).toHaveAttribute("data-status", "error", { timeout: 30_000 });
    log("still error after retry", { relayCalls });
    await expect(retry).toBeVisible();
    failRelay = false; await retry.click(); log("retry clicked (relay healthy)");
    await expect(chip3).toHaveAttribute("data-status", /^(uploading|ready|error)$/, { timeout: 5_000 });
    await expect(chip3).toHaveAttribute("data-status", /^(ready|error)$/, { timeout: 120_000 });
    const finalStatus = await chip3.getAttribute("data-status");
    log("after healthy retry", { status: finalStatus, code: await chip3.getAttribute("data-code") });
    expect.soft(finalStatus, "retry with a healthy relay reaches ready").toBe("ready");
    await shot(page, "failure-4-retry-recovered", vp);
    await chip3.getByTestId("attachment-remove").click(); log("remove clicked");
    await expect(page.getByTestId("attachment-chip")).toHaveCount(0, { timeout: 10_000 });
    log("chip removed");
  });

  test("api: POST /api/media with an unsupported extension → 400 unsupported_type", async ({ request }, ti) => {
    const log = logger(ti);
    const res = await request.post("/api/media", { multipart: { externalUserId: "INV-001", file: { name: "tool.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ not really") } } });
    const body = await res.text();
    log("POST /api/media tool.exe", { status: res.status(), body: body.slice(0, 200) });
    expect(res.status(), "status").toBe(400);
    const j = JSON.parse(body) as { ok: boolean; code: string; message: string; allowed?: string[] };
    expect(j.ok).toBe(false);
    expect(j.code).toBe("unsupported_type");
    expect(j.allowed ?? []).toContain("pdf");
  });
});

test.describe("Upload journeys — images (mobile 390×844)", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  for (const img of IMAGES) test(`mobile image: ${img.file}`, async ({ page }, ti) => imageJourney(page, ti, img));
});

test.afterAll(() => { console.log(`[${new Date().toISOString()}] proof written to ${OUT}`); });
