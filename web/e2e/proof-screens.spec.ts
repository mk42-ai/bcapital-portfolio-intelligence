/**
 * Proof screenshots — NINE named captures written to web/proof/screens/<label>/<name>.png
 * (label = PROOF_LABEL ?? "after"; run once with PROOF_LABEL=before against the old build and once after the merge).
 *
 *   BASE_URL=<preview> PROOF_LABEL=after node node_modules/@playwright/test/cli.js test -c playwright.config.ts e2e/proof-screens.spec.ts --project=desktop
 *
 * Every capture is SOFT: a missing testid (old build), a failed click or a missing route never fails the spec — the shot is still
 * taken and the row in index.json carries {ok:false, note}. index.json = [{name, viewport, path, ok, note}] (merged incrementally so a
 * partial run still leaves a valid index). Uses the raw Playwright `test` (not the helpers fixture) on purpose: console errors on an
 * old build must not abort a proof run — they are recorded in the note instead.
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { primeSettings } from "./helpers";

const LABEL = (process.env.PROOF_LABEL ?? "after").replace(/[^a-z0-9_-]/gi, "_");
const OUT = path.resolve(__dirname, "..", "proof", "screens", LABEL);
const INDEX = path.join(OUT, "index.json");
const DESKTOP = { width: 1440, height: 900 } as const;
const MOBILE = { width: 390, height: 844 } as const;

type Row = { name: string; viewport: string; path: string; ok: boolean; note: string };

test.describe.configure({ mode: "serial" });

function writeRow(row: Row) {
  fs.mkdirSync(OUT, { recursive: true });
  let rows: Row[] = [];
  try { const j = JSON.parse(fs.readFileSync(INDEX, "utf8")); if (Array.isArray(j)) rows = j as Row[]; } catch { rows = []; }
  rows = rows.filter((r) => r.name !== row.name).concat(row);
  fs.writeFileSync(INDEX, JSON.stringify(rows, null, 2));
}

async function shot(page: Page, name: string, viewport: { width: number; height: number }, ok: boolean, notes: string[]) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${name}.png`);
  try { await page.screenshot({ path: file, fullPage: false, animations: "disabled" }); }
  catch (e) { ok = false; notes.push(`screenshot failed: ${String(e).slice(0, 120)}`); }
  const row: Row = { name, viewport: `${viewport.width}x${viewport.height}`, path: path.relative(path.resolve(__dirname, ".."), file), ok, note: notes.join("; ") };
  writeRow(row);
  test.info().annotations.push({ type: "proof", description: `${name}: ${ok ? "ok" : "soft-skip"} ${row.note}` });
  await test.info().attach(name, { path: file, contentType: "image/png" }).catch(() => {});
}

/** Click a testid when present; returns false (and a note) when the old build lacks it. */
async function clickIf(page: Page, testid: string, notes: string[], timeout = 8_000): Promise<boolean> {
  const loc = page.locator(`[data-testid="${testid}"]`).first();
  try { await loc.waitFor({ state: "visible", timeout }); await loc.click({ timeout: 5_000 }); return true; }
  catch { notes.push(`[data-testid=${testid}] absent or not clickable (old build?)`); return false; }
}

async function scrollTo(page: Page, testid: string, notes: string[], timeout = 15_000): Promise<boolean> {
  const loc = page.locator(`[data-testid="${testid}"]`).first();
  try { await loc.waitFor({ state: "attached", timeout }); await loc.scrollIntoViewIfNeeded({ timeout: 5_000 }); await page.waitForTimeout(400); return true; }
  catch { notes.push(`[data-testid=${testid}] absent (old build or no live data)`); return false; }
}

async function open(page: Page, url: string, notes: string[], viewport: { width: number; height: number } = DESKTOP): Promise<boolean> {
  await page.setViewportSize(viewport);
  try {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    if (res && res.status() >= 400) notes.push(`HTTP ${res.status()} for ${url}`);
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => notes.push("networkidle not reached (streams open) — captured anyway"));
    await page.waitForTimeout(600); // hydration + mount-gated UI (nav state, inspector) — see preamble hydration note
    return !res || res.status() < 400;
  } catch (e) { notes.push(`goto failed: ${String(e).slice(0, 120)}`); return false; }
}

function captureConsole(page: Page, notes: string[]) {
  let n = 0;
  page.on("pageerror", (e) => { if (n++ < 3) notes.push(`pageerror: ${e.message.slice(0, 100)}`); });
}

/**
 * In-page SSE mock. Installed BEFORE the app boots; replaces window.fetch for POST /api/chat with a synthetic text/event-stream
 * Response whose frames are pushed with the given delays (page.route cannot hold a streaming body open, hence the in-page wrapper —
 * same technique as chat.spec.ts). Frame shapes mirror src/app/api/chat/route.ts (AG-UI: RUN_STARTED, CUSTOM{name,value},
 * TEXT_MESSAGE_START/CONTENT/END, RUN_FINISHED, terminal `data: [DONE]`). `holdOpenMs` keeps the stream open after the last frame;
 * `done:false` never sends [DONE]/RUN_FINISHED (interactive card must stay mounted while we capture).
 */
type MockFrame = { at: number; frame: unknown };
async function installSseMock(page: Page, frames: MockFrame[], opts: { done: boolean; holdOpenMs: number }) {
  await page.addInitScript(({ frames, opts }) => {
    const orig = window.fetch.bind(window);
    (window as unknown as { __sseMock: string }).__sseMock = "installed";
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = (init?.method ?? (typeof input !== "string" && !(input instanceof URL) ? input.method : "GET")).toUpperCase();
      if (!/\/api\/chat(\?|$)/.test(url) || method !== "POST") return orig(input, init);
      const enc = new TextEncoder();
      let seq = 0;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const push = (obj: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify({ seq: ++seq, ...(obj as object) })}\n\n`));
          let last = 0;
          for (const f of frames) { setTimeout(() => push(f.frame), f.at); last = Math.max(last, f.at); }
          if (opts.done) setTimeout(() => { push({ type: "RUN_FINISHED", threadId: "proof", runId: "proof-run" }); controller.enqueue(enc.encode("data: [DONE]\n\n")); }, last + 50);
          setTimeout(() => { try { controller.close(); } catch { /* already closed */ } }, last + 50 + opts.holdOpenMs);
        },
      });
      return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no", "x-ondemand-session": "proof-session" } });
    };
  }, { frames, opts });
}

const run = (id: string) => ({ type: "RUN_STARTED", threadId: id, runId: `${id}-run` });
const custom = (name: string, value: Record<string, unknown>) => ({ type: "CUSTOM", name, value: { elapsedMs: 10, ...value } });
const status = (phase: string) => custom("ondemand.status", { phase });
const session = () => custom("ondemand.session", { sessionId: "proof-session", created: true, viaHeader: false, endpointId: "predefined-deepseek-flash", reasoningMode: "medium", pluginIds: ["plugin-1722260873"] });
const SOURCES = [
  { url: "https://www.reuters.com/technology/fervo-energy-geothermal", title: "Fervo Energy raises new round for geothermal expansion", sourceName: "Reuters" },
  { url: "https://techcrunch.com/writer-enterprise-ai-funding", title: "Writer lands enterprise AI funding", sourceName: "TechCrunch" },
];

async function sendQuestion(page: Page, q: string, notes: string[]): Promise<boolean> {
  const ta = page.locator("textarea").first();
  try { await ta.waitFor({ state: "visible", timeout: 15_000 }); await ta.fill(q); await ta.press("Enter"); return true; }
  catch { notes.push("composer textarea not found — question not sent"); return false; }
}

test.beforeEach(async ({ page }) => { await primeSettings(page); });

test("chat-desktop (1440×900 /chat)", async ({ page }) => {
  const notes: string[] = []; captureConsole(page, notes);
  const ok = await open(page, "/chat", notes);
  await shot(page, "chat-desktop", DESKTOP, ok && !notes.length, notes);
});

test("chat-mobile (390×844 /chat)", async ({ page }) => {
  const notes: string[] = []; captureConsole(page, notes);
  const ok = await open(page, "/chat", notes, MOBILE);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1).catch(() => false);
  if (overflow) notes.push("horizontal overflow at 390px");
  await shot(page, "chat-mobile", MOBILE, ok && !notes.length, notes);
});

test("rail-collapsed (click nav-toggle)", async ({ page }) => {
  const notes: string[] = []; captureConsole(page, notes);
  const ok = await open(page, "/chat", notes);
  const clicked = ok && (await clickIf(page, "nav-toggle", notes));
  if (clicked) {
    await page.waitForTimeout(400);
    const w = await page.locator('[data-testid="nav-rail"]').first().boundingBox().catch(() => null);
    if (w) notes.push(`nav-rail width after toggle = ${Math.round(w.width)}px`);
  }
  await shot(page, "rail-collapsed", DESKTOP, clicked, notes);
});

test("inspector-drawer (click inspector-toggle)", async ({ page }) => {
  const notes: string[] = []; captureConsole(page, notes);
  const ok = await open(page, "/chat", notes);
  const clicked = ok && (await clickIf(page, "inspector-toggle", notes));
  if (clicked) await page.waitForTimeout(500);
  await shot(page, "inspector-drawer", DESKTOP, clicked, notes);
});

test("pitchbook-drawer (inspector open, scrolled to pitchbook-rail)", async ({ page }) => {
  const notes: string[] = []; captureConsole(page, notes);
  const ok = await open(page, "/chat", notes);
  const opened = ok && (await clickIf(page, "inspector-toggle", notes));
  if (opened) await page.waitForTimeout(500);
  const found = ok && (await scrollTo(page, "pitchbook-rail", notes));
  await shot(page, "pitchbook-drawer", DESKTOP, opened && found, notes);
});

test("company-pitchbook (/company/1au scrolled to pitchbook-card)", async ({ page }) => {
  const notes: string[] = []; captureConsole(page, notes);
  const ok = await open(page, "/company/1au", notes);
  const found = ok && (await scrollTo(page, "pitchbook-card", notes, 20_000));
  await shot(page, "company-pitchbook", DESKTOP, found, notes);
});

test("chat-voice-listening (click voice-mic with fake media, annotate data-state)", async ({ page, context }) => {
  const notes: string[] = []; captureConsole(page, notes);
  await context.grantPermissions(["microphone"]).catch(() => notes.push("microphone permission grant unsupported"));
  const ok = await open(page, "/chat", notes);
  const clicked = ok && (await clickIf(page, "voice-mic", notes));
  let state: string | null = null;
  if (clicked) {
    await page.waitForTimeout(1_500);
    state = await page.locator('[data-testid="voice-mic"]').first().getAttribute("data-state").catch(() => null);
    const panel = await page.locator('[data-testid="voice-panel"]').first().getAttribute("data-state").catch(() => null);
    const err = await page.locator('[data-testid="voice-error"]').first().textContent({ timeout: 500 }).catch(() => null);
    notes.push(`voice-mic data-state=${state ?? "n/a"}`, `voice-panel data-state=${panel ?? "n/a"}`);
    if (err) notes.push(`voice-error: ${err.slice(0, 80)}`);
  }
  await shot(page, "chat-voice-listening", DESKTOP, clicked && state === "listening", notes);
});

test("chat-citations (mock SSE: two sources + text with [1][2])", async ({ page }) => {
  const notes: string[] = []; captureConsole(page, notes);
  const text = "Fervo Energy closed a new geothermal round [1] while Writer expanded its enterprise AI footprint [2].";
  const mid = "proof-msg-1";
  await installSseMock(page, [
    { at: 0, frame: run("proof-cite") },
    { at: 20, frame: status("connecting") },
    { at: 60, frame: session() },
    { at: 100, frame: status("researching") },
    { at: 150, frame: { type: "TOOL_CALL_START", toolCallId: "tc-1", toolCallName: "Perplexity", parentMessageId: mid } },
    { at: 160, frame: { type: "TOOL_CALL_ARGS", toolCallId: "tc-1", delta: JSON.stringify({ plugin: "Perplexity", pluginId: "plugin-1722260873", query: "portfolio news" }) } },
    { at: 300, frame: custom("ondemand.sources", { sources: SOURCES, pluginId: "plugin-1722260873", pluginName: "Perplexity", partial: false }) },
    { at: 320, frame: { type: "TOOL_CALL_END", toolCallId: "tc-1" } },
    { at: 330, frame: { type: "TOOL_CALL_RESULT", toolCallId: "tc-1", messageId: "tc-1-result", role: "tool", content: JSON.stringify({ status: "ok", plugin: "Perplexity", sources: SOURCES }) } },
    { at: 400, frame: status("answering") },
    { at: 420, frame: { type: "TEXT_MESSAGE_START", messageId: mid, role: "assistant" } },
    ...text.split(" ").map((w, i) => ({ at: 450 + i * 40, frame: { type: "TEXT_MESSAGE_CONTENT", messageId: mid, delta: (i ? " " : "") + w } })),
    { at: 450 + text.split(" ").length * 40 + 50, frame: { type: "TEXT_MESSAGE_END", messageId: mid } },
    { at: 450 + text.split(" ").length * 40 + 80, frame: custom("ondemand.metrics", { publicMetrics: { inputTokens: 120, outputTokens: 40, totalTokens: 160, ragTimeSec: 1.2, fulfillmentTimeSec: 0.8, totalTimeSec: 2.0 } }) },
    { at: 450 + text.split(" ").length * 40 + 90, frame: status("done") },
  ], { done: true, holdOpenMs: 200 });
  const ok = await open(page, "/chat", notes);
  const sent = ok && (await sendQuestion(page, "What is the latest on Fervo and Writer?", notes));
  let chips = 0;
  if (sent) {
    await page.locator('[data-testid="citation-chip"], [data-testid="source-link"]').first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => notes.push("no citation-chip/source-link rendered within 15 s (old build?)"));
    await page.waitForTimeout(800);
    chips = await page.locator('[data-testid="citation-chip"]').count();
    const links = await page.locator('[data-testid="source-link"]').count();
    notes.push(`citation-chip=${chips}`, `source-link=${links}`);
  }
  await shot(page, "chat-citations", DESKTOP, sent && chips >= 2, notes);
});

test("interactive-card (mock SSE: ondemand.awaiting_input, stream held open 3 s)", async ({ page }) => {
  const notes: string[] = []; captureConsole(page, notes);
  await installSseMock(page, [
    { at: 0, frame: run("proof-await") },
    { at: 20, frame: status("connecting") },
    { at: 60, frame: session() },
    { at: 120, frame: status("planning") },
    { at: 300, frame: custom("ondemand.awaiting_input", { prompt: "Which company?", options: ["Fervo", "Writer"] }) },
  ], { done: false, holdOpenMs: 30_000 });
  const ok = await open(page, "/chat", notes);
  const sent = ok && (await sendQuestion(page, "Show me the latest round", notes));
  let found = false;
  if (sent) {
    const card = page.locator('[data-testid="awaiting-input-card"], [data-testid="clarification-form"], [data-testid="prompt-card"]').first();
    found = await card.waitFor({ state: "visible", timeout: 10_000 }).then(() => true).catch(() => false);
    if (!found) notes.push("awaiting_input card testid absent (awaiting-input-card | clarification-form | prompt-card)");
    const hasPrompt = await page.getByText("Which company?").first().isVisible().catch(() => false);
    const hasOpts = (await page.getByText("Fervo", { exact: true }).count()) > 0 && (await page.getByText("Writer", { exact: true }).count()) > 0;
    notes.push(`prompt visible=${hasPrompt}`, `options visible=${hasOpts}`);
    found = found || (hasPrompt && hasOpts);
    await page.waitForTimeout(3_000); // stream stays open — the card must still be mounted
  }
  await shot(page, "interactive-card", DESKTOP, sent && found, notes);
});

test.afterAll(() => {
  // Final sanity: every named shot has a row (rows are merged per capture; a crashed capture still leaves earlier rows intact).
  let rows: Row[] = [];
  try { rows = JSON.parse(fs.readFileSync(INDEX, "utf8")) as Row[]; } catch { rows = []; }
  expect.soft(rows.length, `index.json rows at ${INDEX}`).toBeGreaterThan(0);
  console.log(`[proof-screens] ${rows.length} shots → ${OUT} (${rows.filter((r) => r.ok).length} ok, ${rows.filter((r) => !r.ok).length} soft-skipped)`);
});
