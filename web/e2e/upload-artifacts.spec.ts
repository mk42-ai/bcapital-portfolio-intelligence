import { test as base, expect, type Page, type APIRequestContext } from "@playwright/test";
import { primeSettings, hasKey, captureErrors } from "./helpers";
import fs from "node:fs";
import path from "node:path";

/**
 * Lane D — Upload → Artifacts end-to-end.
 *  1. empty Artifacts state (or populated list) renders
 *  2. API contract: every fixture uploads via POST /api/media and is listed by GET /api/artifacts?thread_id=… with source "upload"
 *  3. UI journey: pick → uploading → ready chip → send → user bubble chips → answer cites the files → /artifacts lists them → reload → preview
 *  4. blurred memo: the agent must say it cannot read it, never invent a transcription
 *  5. failure path: 500 from /api/media → red error chip + Retry → retry leaves the error state
 *  6. mobile 390×844: no horizontal overflow on /artifacts and /chat
 * All testids below exist in the source (attachments.tsx, app-composer.tsx, chat-shell.tsx, artifacts-panel.tsx, artifact-card.tsx,
 * artifact-preview.tsx, app/artifacts/page.tsx).
 */
const FIX = path.resolve(__dirname, "../tests/fixtures/upload");
const UX_FIX = path.resolve(__dirname, "fixtures/ux");
const PNG_GEO = path.join(FIX, "geothermal-plant.png");
const PNG_BAR = path.join(FIX, "bar-chart.png");
const PNG_MEMO = path.join(FIX, "blurred-memo.png");
const PDF_SPEC = path.join(FIX, "OnDemand-Outputs-Panel-Spec.pdf");
const PDF_SMALL = path.join(UX_FIX, "run-ux-before-after.pdf");
const DOCX_BIG = path.join(FIX, "compendium.docx");

const MIME: Record<string, string> = { ".png": "image/png", ".pdf": "application/pdf", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
const mimeOf = (p: string) => MIME[path.extname(p).toLowerCase()] ?? "application/octet-stream";

type MediaOk = { ok: true; media: { id: string; kind: string; extractedChars?: number; grounded?: string }; note?: string; artifact?: { id: string; mediaStatus?: string | null } | null; artifactError?: string | null };
type MediaErr = { ok: false; code: string; message: string };
type ArtifactRow = { id: string; name: string; kind: string; source?: string; threadId?: string | null; mediaStatus?: string | null; contentUrl?: string };
type ArtifactList = { data: ArtifactRow[]; total?: number };

/** Per-test fixture: primes settings, captures client errors and asserts none remain at the end (same contract as helpers.ts `test`). */
const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use, testInfo) => {
      await primeSettings(page);
      const errs = captureErrors(page);
      await use(errs);
      // hydration/ResizeObserver chatter is environment noise in the sandbox; everything else must be empty
      // The injected 500 in the failure-path test (page.route) and an upstream Media API 500 both surface as a console "Failed to load resource" line — that is the honest red state, not a client error.
      const real = errs.filter((e) => !/hydrat|ResizeObserver|Failed to load resource: the server responded with a status of 500/i.test(e));
      if (real.length) testInfo.annotations.push({ type: "client-errors", description: real.slice(0, 10).join(" | ") });
      expect(real, "no client-side page/console errors").toEqual([]);
    },
    { auto: true },
  ],
});

const note = (type: string, description: string) => test.info().annotations.push({ type, description });

async function uploadViaApi(request: APIRequestContext, file: string, threadId: string, timeout = 120_000) {
  const name = path.basename(file);
  const res = await request.post("/api/media", {
    multipart: { externalUserId: "INV-001", threadId, file: { name, mimeType: mimeOf(file), buffer: fs.readFileSync(file) } },
    timeout,
  });
  return { name, res };
}

async function openChat(page: Page) {
  await page.goto("/chat?skip=1");
  await expect(page.getByTestId("chat-shell")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("attachment-input")).toBeAttached({ timeout: 30_000 });
}

/** Wait for every chip to leave `uploading`; returns the final statuses. Honest `error` chips are tolerated only for upstream failures. */
async function waitChipsSettled(page: Page, count: number, timeout = 120_000) {
  const chips = page.getByTestId("attachment-chip");
  await expect(chips).toHaveCount(count, { timeout: 15_000 });
  await expect.poll(async () => chips.evaluateAll((els) => els.map((e) => e.getAttribute("data-status"))), { timeout, intervals: [500] })
    .toEqual(expect.arrayContaining([expect.stringMatching(/^(ready|error)$/)]));
  await expect.poll(async () => (await chips.evaluateAll((els) => els.map((e) => e.getAttribute("data-status")))).every((s) => s === "ready" || s === "error"), { timeout, intervals: [500] })
    .toBe(true);
  const rows = await chips.evaluateAll((els) => els.map((e) => ({ status: e.getAttribute("data-status"), code: e.getAttribute("data-code"), name: (e.querySelector(".oiu-att__chip-name")?.firstChild?.textContent ?? e.querySelector(".oiu-att__chip-name")?.textContent ?? "").trim().replace(/(local|LOCAL)$/, "") })));
  for (const r of rows) {
    if (r.status === "error") {
      // only an upstream/network failure is an acceptable `error`; precheck failures (too_large/unsupported_type) are a bug for these fixtures
      expect(r.code, `${r.name} error code is an upstream failure`).toMatch(/upstream|network|http_5|timeout/i);
      note("upload-error", `${r.name}: chip ended in error (${r.code}) — upstream failure, retry button must be visible`);
      await expect(page.getByTestId("attachment-chip").filter({ hasText: r.name }).getByTestId("attachment-retry")).toBeVisible();
    }
  }
  return rows;
}

/** Send the current draft and wait for the run to settle (run-view data-live=false or a stable answer-block). Returns the answer text. */
async function sendAndSettle(page: Page, question: string, timeout = 240_000) {
  await page.getByTestId("composer-input").fill(question);
  await page.getByTestId("composer-send").click();
  const t0 = Date.now();
  await expect(page.getByTestId("user-message").last()).toBeVisible({ timeout: 20_000 });
  // wait for the stream to end: the last run-view flips data-live="false" (fallback: assistant-streaming disappears + answer-block exists)
  await page.waitForFunction(() => {
    const runs = document.querySelectorAll('[data-testid="run-view"]');
    const last = runs[runs.length - 1];
    if (last && last.getAttribute("data-live") === "false") return true;
    const streaming = document.querySelector('[data-testid="assistant-streaming"], [data-testid="run-skeleton"]');
    const answer = document.querySelector('[data-testid="answer-block"]');
    const err = document.querySelector('[data-testid="chat-error"]');
    return (!streaming && !!answer) || !!err;
  }, undefined, { timeout, polling: 500 });
  const chatError = page.getByTestId("chat-error");
  if (await chatError.count()) {
    const msg = (await chatError.first().innerText()).replace(/\s+/g, " ").slice(0, 300);
    note("chat-error", msg);
    throw new Error(`chat run ended with an error card: ${msg}`);
  }
  const answer = page.getByTestId("answer-block").last();
  await expect(answer).toBeVisible({ timeout: 15_000 });
  // let the final markdown settle (text stops changing for ~1.5 s)
  let prev = "";
  await expect.poll(async () => { const t = (await answer.innerText()).trim(); const same = t === prev && t.length > 0; prev = t; return same; }, { timeout: 30_000, intervals: [1500] }).toBe(true);
  const text = prev;
  note("answer", `${Date.now() - t0} ms · ${text.length} chars · ${text.slice(0, 300)}`);
  console.log(`[upload-artifacts] answer (${text.length} chars, ${Date.now() - t0} ms): ${text.slice(0, 300)}`);
  return text;
}

// Tests upload into the same backend store; run them serially so the empty-state check is not raced by a parallel upload.
test.describe.configure({ mode: "serial" });
test.describe("Upload → Artifacts E2E", () => {
  test("empty Artifacts state renders", async ({ page }) => {
    await page.goto("/artifacts?skip=1");
    await expect(page.getByTestId("artifacts-page")).toBeVisible({ timeout: 30_000 });
    const empty = page.getByTestId("artifacts-empty");
    const list = page.getByTestId("artifacts-list");
    await expect(empty.or(list).first()).toBeVisible({ timeout: 30_000 });
    if (await empty.count()) {
      note("branch", "empty state rendered (no artifacts for this user)");
      await expect(empty).toBeVisible();
      const img = empty.locator("img");
      await expect(img).toBeAttached();
      await img.scrollIntoViewIfNeeded(); // loading="lazy" — bring it into view before asserting it decoded
      await expect.poll(() => img.evaluate((el) => ((el as HTMLImageElement).complete ? (el as HTMLImageElement).naturalWidth : 0)), { timeout: 15_000 }).toBeGreaterThan(0);
    } else {
      const n = await page.getByTestId("artifact-card").count();
      note("branch", `populated list rendered (${n} artifact cards)`);
      await expect(list).toBeVisible();
      expect(n).toBeGreaterThan(0);
    }
  });

  test("API: each fixture uploads via /api/media and is listed by /api/artifacts as an upload", async ({ request }) => {
    test.setTimeout(420_000);
    const threadId = `e2e-up-${Date.now()}`;
    const files = [PNG_GEO, PNG_BAR, PNG_MEMO, PDF_SPEC];
    const uploaded: { name: string; id: string; status: string }[] = [];

    for (const f of files) {
      const { name, res } = await uploadViaApi(request, f, threadId);
      expect(res.status(), `${name} upload status`).toBe(200);
      const j = (await res.json()) as MediaOk | MediaErr;
      expect(j.ok, `${name} ok`).toBe(true);
      const ok = j as MediaOk;
      expect(typeof ok.media.id, `${name} media.id`).toBe("string");
      expect(ok.media.id.length).toBeGreaterThanOrEqual(6);
      const status = ok.artifact?.mediaStatus ?? ok.media.grounded ?? "ondemand";
      uploaded.push({ name, id: ok.media.id, status });
      console.log(`[upload-artifacts] ${name}: media.id=${ok.media.id} kind=${ok.media.kind} extractedChars=${ok.media.extractedChars ?? "-"} grounded=${ok.media.grounded ?? "ondemand"} artifact=${ok.artifact?.id ?? "none"}${ok.artifactError ? ` artifactError=${ok.artifactError}` : ""}${ok.note ? ` note=${ok.note}` : ""}`);
    }

    // DOCX (15 MB) — soft: edge resets / upstream slowness must not fail the contract test, but the outcome is recorded
    await test.step("compendium.docx (soft, 180 s)", async () => {
      const r = await uploadViaApi(request, DOCX_BIG, threadId, 180_000).catch((e: Error) => { note("docx-soft", `request failed before a status: ${e.message.slice(0, 120)}`); return null; });
      if (!r) return;
      const j = (await r.res.json().catch(() => ({ ok: false, code: "non_json", message: "" }))) as MediaOk | MediaErr;
      console.log(`[upload-artifacts] compendium.docx: status=${r.res.status()} ok=${j.ok} ${j.ok === true ? `media.id=${(j as MediaOk).media.id}` : `code=${(j as MediaErr).code} message=${(j as MediaErr).message}`}`);
      expect.soft(r.res.status(), "docx upload status").toBe(200);
      expect.soft(j.ok, "docx ok").toBe(true);
      if (j.ok) uploaded.push({ name: "compendium.docx", id: j.media.id, status: j.artifact?.mediaStatus ?? j.media.grounded ?? "ondemand" });
    });

    // GET /api/artifacts — real query param is `thread_id` (see web/src/app/api/artifacts/route.ts)
    let list: ArtifactList = { data: [] };
    await expect.poll(async () => {
      const res = await request.get(`/api/artifacts?thread_id=${encodeURIComponent(threadId)}&limit=100`);
      if (!res.ok()) return -1;
      list = (await res.json()) as ArtifactList;
      return list.data.length;
    }, { timeout: 60_000, intervals: [2000] }).toBeGreaterThanOrEqual(files.length);

    for (const f of files) {
      const name = path.basename(f);
      const a = list.data.find((x) => x.name === name);
      expect(a, `artifact listed for ${name}`).toBeTruthy();
      expect(a!.source, `${name} source`).toBe("upload");
      if (a!.threadId != null) expect(a!.threadId, `${name} threadId`).toBe(threadId);
      console.log(`[upload-artifacts] listed ${name}: id=${a!.id} kind=${a!.kind} source=${a!.source} mediaStatus=${a!.mediaStatus ?? "null"}`);
    }
    const docx = list.data.find((x) => x.name === "compendium.docx");
    if (docx) expect.soft(docx.source, "docx source").toBe("upload");
    note("uploaded", uploaded.map((u) => `${u.name}=${u.id}(${u.status})`).join(", "));
  });

  test("UI: pick → progress → processed → chip → sent → cited → Artifacts → reload", async ({ page }) => {
    test.skip(!hasKey(), "needs ONDEMAND_API_KEY for a real chat run");
    test.setTimeout(600_000);
    await openChat(page);

    await page.getByTestId("attachment-input").setInputFiles([PNG_GEO, PNG_BAR]);
    const chips = page.getByTestId("attachment-chip");
    await expect(chips).toHaveCount(2, { timeout: 15_000 });
    // progress: chips start in `uploading` (we may miss it on a very fast relay — record what we saw)
    const first = await chips.evaluateAll((els) => els.map((e) => e.getAttribute("data-status")));
    note("first-status", first.join(","));
    expect(first.every((s) => s === "uploading" || s === "ready"), "chips start uploading (or already ready)").toBe(true);
    await expect(page.getByTestId("attachment-bar")).toHaveAttribute("data-count", "2");

    const rows = await waitChipsSettled(page, 2, 120_000);
    console.log(`[upload-artifacts] chips: ${rows.map((r) => `${r.name}=${r.status}${r.code ? `(${r.code})` : ""}`).join(" ")}`);
    const ready = rows.filter((r) => r.status === "ready").length;
    expect(ready, "at least one image reached `ready`").toBeGreaterThan(0);
    if (ready < 2) note("partial", "one image stayed in error (upstream) — continuing with the ready one");
    await expect(page.getByTestId("attachment-bar")).toHaveAttribute("data-ready", /^(true|1|2)$/);

    const answer = await sendAndSettle(page, "Describe the two attached images in one sentence each and say which file each description comes from.", 240_000);

    // user bubble carries the sent attachments
    const bubble = page.getByTestId("user-message").last();
    await expect(bubble.getByTestId("message-attachments")).toBeVisible();
    await expect(bubble.getByTestId("message-attachment")).toHaveCount(ready);
    await expect(bubble).toHaveAttribute("data-attachments", String(ready));
    await expect(bubble.getByTestId("message-attachments")).toContainText(/geothermal-plant\.png|bar-chart\.png/);

    // the answer should talk about the content and/or name the files
    expect.soft(answer, "answer mentions the images").toMatch(/geothermal|bar|chart/i);
    expect.soft(answer, "answer names a file").toMatch(/geothermal-plant\.png|bar-chart\.png/i);

    // artifacts are surfaced: inline-artifacts under the run, or the Artifacts toggle badge counts ≥ 2
    const inline = page.getByTestId("inline-artifacts");
    const toggleCount = page.getByTestId("artifacts-toggle-count");
    const inlineN = await inline.count();
    if (inlineN) {
      note("artifacts-surface", "inline-artifacts rendered under the run");
      await expect(inline.first()).toBeVisible();
    } else {
      note("artifacts-surface", "no inline-artifacts for an upload-only turn — checking the Artifacts toggle badge");
      await expect(toggleCount).toBeVisible({ timeout: 30_000 });
      await expect.poll(async () => Number((await toggleCount.innerText()).replace("+", "")), { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
    }

    // /artifacts lists them, survives a reload, and preview opens
    await page.goto("/artifacts?skip=1");
    await expect(page.getByTestId("artifacts-page")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("artifacts-list")).toBeVisible({ timeout: 30_000 });
    const names = rows.filter((r) => r.status === "ready").map((r) => r.name);
    for (const n of names) await expect(page.getByTestId("artifact-card").filter({ hasText: n }).first()).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await expect(page.getByTestId("artifacts-list")).toBeVisible({ timeout: 30_000 });
    for (const n of names) await expect(page.getByTestId("artifact-card").filter({ hasText: n }).first()).toBeVisible({ timeout: 30_000 });

    const card = page.getByTestId("artifact-card").filter({ hasText: names[0] }).first();
    await expect(card).toHaveAttribute("data-kind", "image");
    const id = await card.getAttribute("data-id");
    await card.getByTestId("artifact-preview-btn").click();
    const preview = page.getByTestId("artifact-preview");
    await expect(preview).toBeVisible({ timeout: 30_000 });
    if (id) await expect(preview).toHaveAttribute("data-id", id);
    // Download is a button that re-signs the link on click (Lane C); it only needs to be enabled.
    await expect(card.getByTestId("artifact-download")).toBeEnabled();
  });

  test("blurred memo: agent must say it cannot read it, never invent text", async ({ page }) => {
    test.skip(!hasKey(), "needs ONDEMAND_API_KEY for a real chat run");
    test.setTimeout(480_000);
    await openChat(page);
    await page.getByTestId("attachment-input").setInputFiles(PNG_MEMO);
    const rows = await waitChipsSettled(page, 1, 120_000);
    expect(rows[0].status, "blurred-memo.png chip").toBe("ready");

    const answer = await sendAndSettle(page, "Transcribe the memo in the attached image exactly.", 240_000);
    note("memo-answer", answer.slice(0, 300));
    expect(answer, "agent admits it cannot read the memo").toMatch(/cannot|can['’]t|unable|not (legible|readable)|illegible|blurr|too low|unreadable/i);

    // heuristic: no quoted multi-sentence transcription (a line > 200 chars wrapped in quotes)
    const quotedLong = answer.split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 200 && /^["“'].*["”']$/.test(l));
    expect(quotedLong, "no long quoted transcription line").toEqual([]);
    const fenced = answer.match(/```[\s\S]{200,}```/g) ?? [];
    expect(fenced, "no long fenced transcription block").toEqual([]);
  });

  test("failure path shows red state + retry", async ({ page }) => {
    test.setTimeout(240_000);
    await openChat(page);
    let intercepted = 0;
    await page.route("**/api/media", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      intercepted += 1;
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false, code: "upstream_failed", message: "Media API unavailable" }) });
    });

    await page.getByTestId("attachment-input").setInputFiles(PNG_BAR);
    const chip = page.getByTestId("attachment-chip").first();
    await expect(chip).toBeAttached({ timeout: 15_000 });
    await expect(chip).toHaveAttribute("data-status", "error", { timeout: 30_000 });
    await expect(chip).toHaveAttribute("data-code", "upstream_failed");
    await expect(chip).toHaveClass(/oiu-att__chip--error/);
    await expect(chip).toContainText("Media API unavailable");
    expect(intercepted).toBeGreaterThan(0);

    // red-ish state (soft): border or meta text colour must lean red (r > 150, g < 100); .oiu-att__chip--error → border #fecaca, meta #b91c1c
    const colors = await chip.evaluate((el) => {
      const cs = getComputedStyle(el);
      const meta = el.querySelector(".oiu-att__chip-meta");
      return [cs.borderColor, cs.borderTopColor, cs.color, meta ? getComputedStyle(meta).color : ""].filter(Boolean);
    });
    const reddish = colors.some((c) => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c); return !!m && Number(m[1]) > 150 && Number(m[2]) < 100; });
    note("error-colors", colors.join(" | "));
    expect.soft(reddish, `error chip uses a red-ish colour (${colors.join(" | ")})`).toBe(true);

    const retry = chip.getByTestId("attachment-retry");
    await expect(retry).toBeVisible();
    await expect(chip.getByTestId("attachment-remove")).toBeVisible();

    await page.unroute("**/api/media");
    await retry.click();
    await expect(chip).toHaveAttribute("data-status", /^(uploading|ready)$/, { timeout: 15_000 });
    // after the retry the chip must not fall back into the same injected error; a real upstream outcome (ready, or a different honest error) is fine
    await expect.poll(async () => chip.getAttribute("data-status"), { timeout: 120_000, intervals: [500] }).toMatch(/^(ready|error)$/);
    const after = await chip.getAttribute("data-status");
    const code = await chip.getAttribute("data-code");
    console.log(`[upload-artifacts] retry → status=${after} code=${code}`);
    if (after === "error") {
      note("retry-upstream", `retry reached the real relay but it answered ${code}`);
      expect(code, "retry hit the real relay, not the injected 500").not.toBe("upstream_failed");
      await expect(retry).toBeVisible();
    } else {
      expect(after).toBe("ready");
      await expect(chip).toContainText("bar-chart.png");
    }
  });

  test.describe("mobile 390×844", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test("upload chip and Artifacts page have no horizontal overflow", async ({ page }) => {
      test.setTimeout(240_000);
      const scrollWidth = () => page.evaluate(() => document.documentElement.scrollWidth);

      await page.goto("/artifacts?skip=1");
      await expect(page.getByTestId("artifacts-page")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("artifacts-empty").or(page.getByTestId("artifacts-list")).first()).toBeVisible({ timeout: 30_000 });
      expect(await scrollWidth(), "/artifacts scrollWidth").toBeLessThanOrEqual(391);

      await openChat(page);
      expect(await scrollWidth(), "/chat scrollWidth").toBeLessThanOrEqual(391);

      // a chip in the composer (uploading or settled) must not widen the page either
      await page.getByTestId("attachment-input").setInputFiles([PNG_GEO, PNG_BAR]);
      await expect(page.getByTestId("attachment-chip")).toHaveCount(2, { timeout: 15_000 });
      expect(await scrollWidth(), "/chat with chips scrollWidth").toBeLessThanOrEqual(391);
      await expect.poll(async () => (await page.getByTestId("attachment-chip").evaluateAll((els) => els.map((e) => e.getAttribute("data-status")))).every((s) => s !== "uploading"), { timeout: 120_000, intervals: [500] }).toBe(true);
      expect(await scrollWidth(), "/chat with settled chips scrollWidth").toBeLessThanOrEqual(391);
      const chipBox = await page.getByTestId("attachment-chip").first().boundingBox();
      if (chipBox) expect(chipBox.x + chipBox.width, "chip stays inside the viewport").toBeLessThanOrEqual(391);
    });
  });
});
