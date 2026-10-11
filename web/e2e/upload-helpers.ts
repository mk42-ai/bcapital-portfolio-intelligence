import { expect, type Page, type TestInfo, type APIRequestContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/** Shared helpers for e2e/upload-journeys.spec.ts (Lane D). No app source is touched — selectors are the composer/run-view data-testids. */
export const OUT = path.resolve(__dirname, process.env.UPLOAD_OUT ?? "../proof/upload-journeys");
export const LATENCY = path.join(OUT, "latency.json");
export const LOG = path.join(OUT, "journey-log.ndjson");
fs.mkdirSync(OUT, { recursive: true });

export const FIX_IMG = path.resolve(__dirname, "../tests/fixtures");
export const FIX_PDF = path.resolve(__dirname, "../../docs/reference/submit-query-v1-sse-reference.pdf");
export const FIX_PDF_FALLBACK = path.resolve(__dirname, "../public/fixtures/zephyr-7.pdf");
export const FIX_DOCX = path.resolve(__dirname, "../tests/fixtures/upload/compendium.docx");

export const iso = () => new Date().toISOString();
export function logger(ti: TestInfo, page?: Page) {
  return (action: string, extra: Record<string, unknown> = {}) => {
    const line = { at: iso(), project: ti.project.name, viewport: viewportTag(ti, page), test: ti.title, action, ...extra };
    console.log(`[${line.at}] [${line.viewport}] ${action}${Object.keys(extra).length ? " " + JSON.stringify(extra) : ""}`);
    try { fs.appendFileSync(LOG, JSON.stringify(line) + "\n"); } catch { /* best effort */ }
  };
}
/** Viewport tag from the live page (test.use overrides are not visible on TestInfo); falls back to the project viewport. */
export function viewportTag(ti: TestInfo, page?: Page) {
  const vp = page?.viewportSize() ?? (ti.project.use as { viewport?: { width: number; height: number } }).viewport;
  return vp && vp.width <= 500 ? "390x844" : "1440x900";
}
export async function shot(page: Page, name: string, vp: string) {
  const p = path.join(OUT, `${name}-${vp}.png`);
  await page.screenshot({ path: p, fullPage: false }).catch(() => undefined);
  return p;
}
export function appendLatency(row: Record<string, unknown>) {
  let all: unknown[] = [];
  try { all = JSON.parse(fs.readFileSync(LATENCY, "utf8")) as unknown[]; } catch { all = []; }
  all.push({ at: iso(), ...row });
  fs.writeFileSync(LATENCY, JSON.stringify(all, null, 2));
}
/** Honest gap report: annotation + soft assertion (never a silent skip). */
export function gap(ti: TestInfo, what: string, detail: string) {
  ti.annotations.push({ type: "app-gap", description: `${what}: ${detail}` });
  console.log(`[${iso()}] APP-GAP ${what}: ${detail}`);
  expect.soft(false, `${what} — ${detail}`).toBe(true);
}

export async function openChat(page: Page) {
  await page.goto("/chat?skip=1", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("attachment-input")).toBeAttached({ timeout: 30_000 });
}

/** Pick a file through the hidden <input type=file>, observe `uploading` (best effort — small files can finish in <50 ms) then `ready`. */
export async function attachAndWaitReady(page: Page, ti: TestInfo, file: string | { name: string; mimeType: string; buffer: Buffer }, opts: { timeout?: number } = {}) {
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
  const progress = await chip.locator("[data-progress], progress, .oiu-att__bar, [role=progressbar]").first().getAttribute("data-progress").catch(() => null);
  log("chip created", { name, status: first, progressAttr: progress });
  if (first === "uploading") log("chip status=uploading observed", { name });
  else ti.annotations.push({ type: "note", description: `${name}: first observed chip status was "${first}" (upload finished before the first DOM read)` });
  await expect(chip).toHaveAttribute("data-status", /^(ready|error)$/, { timeout: opts.timeout ?? 180_000 });
  const status = await chip.getAttribute("data-status");
  const info = { name, status, grounded: await chip.getAttribute("data-grounded"), kind: await chip.getAttribute("data-kind"), code: await chip.getAttribute("data-code"), ms: Date.now() - t0, text: (await chip.innerText()).replace(/\s+/g, " ").trim().slice(0, 160) };
  log("chip settled", info);
  return { chip, ...info };
}

export type Turn = { firstTokenMs: number | null; totalMs: number; text: string; dataGap: string | null; badge: string | null; streamed: boolean };
/** Type the question, click send, measure send→first answer text and wait for the stream to settle (or the deadline). */
export async function askAndWait(page: Page, ti: TestInfo, question: string, opts: { deadlineMs?: number; minChars?: number } = {}): Promise<Turn> {
  const log = logger(ti, page);
  const deadline = opts.deadlineMs ?? 200_000; const minChars = opts.minChars ?? 40;
  const runsBefore = await page.getByTestId("run-view").count();
  await page.getByTestId("composer-input").fill(question);
  await expect(page.getByTestId("composer-send")).toBeEnabled({ timeout: 30_000 });
  const t0 = Date.now(); log("send click", { question });
  await page.getByTestId("composer-send").click();
  const run = page.getByTestId("run-view").nth(runsBefore);
  const answer = run.getByTestId("answer-block");
  let firstTokenMs: number | null = null; let text = ""; let seenSkeleton = false;
  while (Date.now() - t0 < deadline) {
    if (!seenSkeleton && (await run.locator('[data-testid="thinking-block"], [data-testid="working-row"]').count()) > 0) { seenSkeleton = true; log("skeleton (thinking/working) visible", { ms: Date.now() - t0 }); }
    if ((await answer.count()) > 0) {
      const t = ((await answer.first().textContent()) ?? "").trim();
      if (t.length > 0 && firstTokenMs == null) { firstTokenMs = Date.now() - t0; log("first answer token", { ms: firstTokenMs, preview: t.slice(0, 60) }); }
      text = t;
    }
    const streaming = await page.getByTestId("assistant-streaming").count();
    if (firstTokenMs != null && streaming === 0 && text.length >= Math.min(minChars, 1)) break;
    await page.waitForTimeout(300);
  }
  const totalMs = Date.now() - t0;
  const dataGap = (await run.getByTestId("data-gap").count()) ? ((await run.getByTestId("data-gap").first().textContent()) ?? "").trim() : null;
  const badge = (await run.getByTestId("answer-badge").count()) ? ((await run.getByTestId("answer-badge").first().textContent()) ?? "").trim() : null;
  const turn: Turn = { firstTokenMs, totalMs, text, dataGap, badge, streamed: firstTokenMs != null };
  log("turn settled", { firstTokenMs, totalMs, chars: text.length, dataGap, badge, preview: text.slice(0, 240) });
  appendLatency({ test: ti.title, viewport: viewportTag(ti, page), question, firstTokenMs, totalMs, answerChars: text.length, dataGap: !!dataGap });
  return turn;
}

export type ArtifactRow = { id: string; name: string; kind?: string; source?: string; originEvent?: string | null; threadId?: string | null; contentUrl?: string };
export async function listArtifacts(request: APIRequestContext, threadId?: string | null): Promise<ArtifactRow[]> {
  const url = `/api/artifacts?limit=200${threadId ? `&thread_id=${encodeURIComponent(threadId)}` : ""}`;
  const r = await request.get(url, { timeout: 30_000 });
  if (!r.ok()) return [];
  const j = (await r.json()) as { data?: ArtifactRow[] };
  return j.data ?? [];
}
/** Poll the proxy until an artifact with this name exists (backend write is async behind the relay). */
export async function waitForArtifact(request: APIRequestContext, name: string, timeout = 60_000) {
  const t0 = Date.now(); let last: ArtifactRow[] = [];
  while (Date.now() - t0 < timeout) {
    last = await listArtifacts(request);
    const hit = last.find((a) => a.name === name);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}
/** Artifacts route: Lane C keeps artifacts-list / artifact-item; the current build renders artifact-card — accept both. */
export const artifactItem = (page: Page, name: string) =>
  page.locator('[data-testid="artifacts-list"] [data-testid="artifact-item"], [data-testid="artifacts-list"] [data-testid="artifact-card"], [data-testid="artifacts-page"] [data-testid="artifact-item"], [data-testid="artifacts-page"] [data-testid="artifact-card"]').filter({ hasText: name }).first();
export async function clickUploadsFilter(page: Page) {
  const f = page.locator('[data-testid="artifact-filter-upload"], [data-testid="artifacts-filter-upload"], [data-testid="artifact-filter-uploads"], [data-testid="artifact-filter-input"], [data-testid="artifact-filter-inputs"]').first();
  if (await f.count()) { await f.click(); return true; }
  return false;
}
/** True when the chip's visible colours are red-ish (brand failure red #EF4444 family) — border, text or background. */
export async function isRedState(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((el) => {
    const parse = (c: string) => { const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/); return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : +m[4] } : null; };
    const red = (c: string | null) => { const v = c ? parse(c) : null; return !!v && v.a > 0 && v.r >= 150 && v.r > v.g + 50 && v.r > v.b + 50; };
    const nodes = [el, ...Array.from(el.querySelectorAll<HTMLElement>("*"))].slice(0, 30);
    return nodes.some((n) => { const cs = getComputedStyle(n); return red(cs.color) || red(cs.borderColor) || red(cs.borderLeftColor) || red(cs.backgroundColor) || red(cs.outlineColor); });
  });
}
