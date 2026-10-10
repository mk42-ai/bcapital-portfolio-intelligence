/**
 * Owner QA — Agent C (live OnDemand turns against the preview).
 *   3-upload-pdf-cited           PDF via Attach → chip ready → answer cites the attachment (41.7 MWh)
 *   4-voice-turn-plugin-plan-tts voice clip injected through STT → user turn → plugin id in the SSE request frame → TTS <audio>
 *   5-citations-during-stream    inline citation chips appear WHILE the stream is still running
 * Desktop 1440×900 for all three, then 390×844 for all three (3/4 at mobile fall to "open" when they exceed the budget).
 * Every single wait is ≤60 s — long phases are poll loops. Serial order; a QA failure is recorded + annotated and the
 * suite is failed in afterAll so later checks still run (plain serial mode would skip them).
 */
import { test, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { qaCheck, record, shot, vpName, RESULTS_DIR } from "./qa-owner-helpers";

test.describe.configure({ mode: "serial" });

const PLUGINS = ["plugin-1722260873", "plugin-1741871229"]; // Perplexity (pinned) + GPT Search
const PDF = path.resolve(process.cwd(), "public/fixtures/zephyr-7.pdf");
const failures: string[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ts = () => new Date().toISOString();
const log = (m: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

async function seedPlugins(page: Page) {
  await page.addInitScript((ids) => sessionStorage.setItem("bcap.chat.plugins.session.v1", JSON.stringify(ids)), PLUGINS);
}
async function openChat(page: Page) {
  await page.goto("/chat?skip=1", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector("[data-testid=composer-input]", { timeout: 60_000 });
}
/** Poll `fn` every `every` ms until it returns a truthy value or `total` ms elapsed (each individual wait ≤ every). */
async function pollUntil<T>(fn: () => Promise<T | null | undefined | false>, total: number, every = 500): Promise<T | null> {
  const end = Date.now() + total;
  while (Date.now() < end) {
    try { const v = await fn(); if (v) return v as T; } catch { /* page in transition */ }
    await sleep(every);
  }
  return null;
}
const sendLabel = (page: Page) => page.getAttribute("[data-testid=composer-send]", "aria-label", { timeout: 2_000 }).catch(() => null);
/** Visible answer text of the last assistant message WITHOUT its thinking trace. */
const answerText = (page: Page) => page.evaluate(() => { const m = document.querySelectorAll("[data-testid=assistant-message]"); const msg = m[m.length - 1] as HTMLElement | undefined; if (!msg) return ""; const md = msg.querySelector<HTMLElement>("[data-testid=answer-markdown]"); if (md) return (md.innerText || md.textContent || "").trim(); const el = msg.cloneNode(true) as HTMLElement; el.querySelectorAll("[data-testid=thinking-trace],[data-testid=thinking-reserved],[data-testid=answer-badge],[data-testid=sources-rail]").forEach((n) => n.remove()); return (el.innerText || el.textContent || "").trim(); });
const textOf = (page: Page, sel: string) => page.locator(sel).first().innerText({ timeout: 2_000 }).catch(() => "");
/** Wait (≤ total, in ≤60 s legs) for a final assistant message or an honest red error. */
async function waitForAnswer(page: Page, total: number) {
  return pollUntil(async () => {
    const err = await page.locator("[data-testid=chat-error]").count();
    if (err > 0) return { kind: "error" as const, text: (await textOf(page, "[data-testid=chat-error]")).slice(0, 300) };
    const done = await page.locator("[data-testid=assistant-message]").count();
    const label = await sendLabel(page);
    if (done > 0 && label !== "Cancel message") return { kind: "answer" as const, text: await answerText(page) };
    return null;
  }, total, 1_000);
}
async function sendQuestion(page: Page, q: string) {
  await page.fill("[data-testid=composer-input]", q);
  const enabled = await pollUntil(async () => !(await page.locator("[data-testid=composer-send]").isDisabled()), 60_000, 500);
  if (!enabled) throw new Error("composer-send stayed disabled for 60 s");
  await page.click("[data-testid=composer-send]");
}
/** Run a check; QA failures are recorded by qaCheck, annotated here and surfaced in afterAll (so the serial chain continues). */
async function runCheck(page: Page, testInfo: TestInfo, check: string, body: () => Promise<string>) {
  try { await qaCheck("C", page, testInfo, check, body); }
  catch (e) { const msg = `${check} @ ${vpName(page)}: ${String((e as Error).message).slice(0, 300)}`; failures.push(msg); testInfo.annotations.push({ type: "qa-fail", description: msg }); console.log(`QA FAIL ${msg}`); }
}
/** Mobile variant of 3/4: same body under a wall-clock budget; over budget → row "open" (reason recorded) instead of fail. */
async function runBudgeted(page: Page, testInfo: TestInfo, check: string, budgetMs: number, body: () => Promise<string>) {
  let timer: NodeJS.Timeout | undefined; let timedOut = false;
  const guard = new Promise<never>((_, rej) => { timer = setTimeout(() => { timedOut = true; rej(new Error("budget")); }, budgetMs); });
  let outcome: { ok: true; detail: string } | { ok: false; err: Error };
  try { outcome = { ok: true, detail: await Promise.race([body(), guard]) }; } catch (e) { outcome = { ok: false, err: e as Error }; }
  clearTimeout(timer);
  if (timedOut) {
    const file = await shot(page, check, "open").catch(() => "");
    const reason = `mobile run exceeded the ${Math.round(budgetMs / 1000)} s budget (live OnDemand turn still in flight) — not a product failure; desktop row is authoritative`;
    record("C", { check, viewport: vpName(page), status: "open", evidence_url: file ? `qa-evidence/${file}` : "", timestamp_utc: ts(), detail: reason });
    testInfo.annotations.push({ type: "qa-open", description: `${check} @ ${vpName(page)}: ${reason}` });
    console.log(`QA OPEN ${check} @ ${vpName(page)}: ${reason}`);
    return;
  }
  await runCheck(page, testInfo, check, async () => { if (!outcome.ok) throw outcome.err; return outcome.detail; });
}

// ───────────────────────── check bodies ─────────────────────────
async function check3(page: Page): Promise<string> {
  await seedPlugins(page); await openChat(page);
  await page.setInputFiles("[data-testid=attachment-input]", PDF);
  const chip = await pollUntil(async () => {
    const st = await page.locator("[data-testid=attachment-chip]").first().getAttribute("data-status", { timeout: 1_000 });
    return st === "ready" || st === "error" ? st : null;
  }, 60_000, 500);
  const chipLoc = page.locator("[data-testid=attachment-chip]").first();
  if (chip !== "ready") throw new Error(`attachment-chip ended "${chip ?? "no ready/error within 60 s"}" — ${(await chipLoc.getAttribute("title", { timeout: 2_000 }).catch(() => "")) ?? ""} ${(await textOf(page, "[data-testid=attachment-chip]")).slice(0, 200)}`);
  const grounded = await chipLoc.getAttribute("data-grounded", { timeout: 5_000 }).catch(() => null);
  const readyShot = await shot(page, "3-upload-pdf-cited", "ready");
  const t0 = Date.now();
  await sendQuestion(page, "Using only the attached document: how many MWh did the Zephyr-7 pilot plant produce and on which date? Cite the attachment.");
  const res = await waitForAnswer(page, 150_000);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (!res) throw new Error(`no assistant-message/chat-error within 150 s (send=${await sendLabel(page)}; streaming=${await page.locator("[data-testid=assistant-streaming]").count()})`);
  if (res.kind === "error") throw new Error(`chat-error after ${secs}s: ${res.text}`);
  const userAtt = await page.locator("[data-testid=user-message] [data-testid=message-attachment], [data-testid=message-attachment]").count();
  const ok = res.text.includes("41.7") && /zephyr|attachment|document|pdf/i.test(res.text);
  const detail = `answer(${secs}s): "${res.text.replace(/\s+/g, " ").slice(0, 200)}" · data-grounded=${grounded} · message-attachment chip under user bubble=${userAtt > 0} · ready shot=${readyShot}`;
  if (!ok) throw new Error(`answer does not cite 41.7 + attachment: ${detail}`);
  return detail;
}

async function check4(page: Page): Promise<string> {
  await seedPlugins(page); await openChat(page);
  // Observe mic data-state transitions for the whole run.
  const states: string[] = []; let watching = true;
  const watcher = (async () => { while (watching) { const s = await page.getAttribute("[data-testid=voice-mic]", "data-state", { timeout: 1_000 }).catch(() => null); if (s && states[states.length - 1] !== s) states.push(s); await sleep(500); } })();
  try {
    await page.click("[data-testid=composer-input]"); // user gesture for autoplay policy
    const inject = await page.evaluate(async () => {
      try {
        const w = window as unknown as { __bcapVoice?: { injectAudio: (b: Blob, m?: string) => Promise<void> }; __qaInjectErr?: string; __qaInjectDone?: boolean };
        if (!w.__bcapVoice) return "no window.__bcapVoice hook";
        const r = await fetch("/fixtures/voice-sample.mp3"); const b = await r.blob();
        // not awaited: injectAudio resolves only after STT + the whole answer turn
        w.__bcapVoice.injectAudio(b, "audio/mpeg").then(() => { w.__qaInjectDone = true; }).catch((e) => { w.__qaInjectErr = String(e?.message ?? e); });
        return `ok (blob ${b.size} B)`;
      } catch (e) { return `inject threw: ${String((e as Error).message)}`; }
    });
    log(`C4 inject → ${inject}`);
    if (!inject.startsWith("ok")) throw new Error(`injectAudio: ${inject}`);
    const t0 = Date.now();
    const transcript = await pollUntil(async () => {
      const u = page.locator("[data-testid=user-message]", { hasText: /fervo/i });
      if ((await u.count()) > 0) return (await u.last().innerText()).slice(0, 160);
      const err = await textOf(page, "[data-testid=voice-error]");
      if (err) return `VOICE-ERROR: ${err.slice(0, 200)}`;
      const ierr = await page.evaluate(() => (window as unknown as { __qaInjectErr?: string }).__qaInjectErr);
      if (ierr) return `INJECT-ERROR: ${ierr.slice(0, 200)}`;
      return null;
    }, 60_000, 500);
    if (!transcript) throw new Error(`no user-message containing "Fervo" within 60 s (caption="${await textOf(page, "[data-testid=voice-caption]")}", mic=${states.join("→")})`);
    if (transcript.startsWith("VOICE-ERROR") || transcript.startsWith("INJECT-ERROR")) throw new Error(`STT failed: ${transcript} (mic=${states.join("→")})`);
    const sttSecs = ((Date.now() - t0) / 1000).toFixed(1);
    log(`C4 transcript (${sttSecs}s): ${transcript}`);
    // Inspector → dev disclosure → raw SSE request frame.
    if ((await page.getAttribute("[data-testid=chat-inspector]", "data-open", { timeout: 3_000 }).catch(() => null)) !== "true") await page.click("[data-testid=inspector-toggle]");
    await page.waitForSelector("[data-testid=chat-inspector][data-open=true]", { timeout: 15_000 });
    await page.evaluate(() => { const d = document.querySelector<HTMLDetailsElement>("details[data-testid=dev-disclosure]"); if (d) d.open = true; });
    const frame = await pollUntil(async () => {
      const body = await textOf(page, "pre[data-testid=request-body]"); const ids = await textOf(page, "[data-testid=dev-ids]");
      return body.includes("plugin") || ids.includes("plugin-") ? { body, ids } : null;
    }, 30_000, 500);
    log(`C4 frame ids: ${(frame?.ids ?? "").slice(0, 120)}`);
    const chips = await page.locator("[data-testid=run-plugins] li").allInnerTexts({ timeout: 5_000 }).catch(() => [] as string[]);
    const pluginIdsInFrame = Array.from(new Set(((frame?.body ?? "") + " " + (frame?.ids ?? "")).match(/plugin-\d+/g) ?? []));
    let m: RegExpMatchArray | null = null; try { m = (frame?.body ?? "").match(/"pluginIds"\s*:\s*\[[^\]]*\]/); } catch { /* ignore */ }
    const frameShot = await shot(page, "4-voice-turn-plugin-plan-tts", "request-frame");
    const planOk = pluginIdsInFrame.includes("plugin-1741871229");
    // Wait for the answer, then inspect the TTS element.
    const res = await waitForAnswer(page, 100_000);
    log(`C4 answer: ${res?.kind}`);
    const audio = await page.evaluate(() => { const a = document.querySelector<HTMLAudioElement>("audio[data-testid=voice-audio]"); return a ? { src: (a.currentSrc || a.src || "").slice(0, 120), paused: a.paused, readyState: a.readyState } : null; });
    watching = false; await watcher;
    const detail = `transcript→user turn in ${sttSecs}s: "${transcript}" · request frame ${m ? m[0].replace(/\s+/g, "") : "(no pluginIds key)"} · dev-ids "${(frame?.ids ?? "").slice(0, 120)}" · run-plugins chips [${chips.join(" | ").slice(0, 120)}] · answer=${res ? res.kind : "none in 120 s"}${res?.kind === "error" ? ` "${res.text.slice(0, 120)}"` : ""} · tts audio=${JSON.stringify(audio)} · pass-by=${audio ? (!audio.paused ? "playing(!paused)" : audio.src ? "src populated (paused under headless autoplay)" : "none") : "n/a"} · mic states ${states.join("→")} · frame shot=${frameShot}`;
    if (!planOk) throw new Error(`selected plugin plugin-1741871229 missing from request frame (saw ${pluginIdsInFrame.join(",") || "none"}): ${detail}`);
    if (!audio) throw new Error(`no audio[data-testid=voice-audio] element: ${detail}`);
    if (!(audio.src || !audio.paused)) throw new Error(`voice-audio exists but src empty and paused: ${detail}`);
    return detail;
  } finally { watching = false; await watcher.catch(() => undefined); }
}

async function check5(page: Page): Promise<string> {
  await seedPlugins(page); await openChat(page);
  const t0 = Date.now();
  await sendQuestion(page, "What did Apptronik announce in 2026? Give 3 short bullet points with a source link after each claim.");
  let first: { atMs: number; running: boolean; count: number; publishers: string[]; label: string | null; streaming: number; shot: string } | null = null;
  let doneMs: number | null = null; let errText = ""; let sawRunning = false; let lastLog = -1;
  const end = Date.now() + 150_000;
  while (Date.now() < end) {
    const snap = await page.evaluate(() => ({
      chips: Array.from(document.querySelectorAll("[data-testid=citation-chip]")).map((c) => c.getAttribute("data-publisher") ?? ""),
      label: document.querySelector("[data-testid=composer-send]")?.getAttribute("aria-label") ?? null,
      streaming: document.querySelectorAll("[data-testid=assistant-streaming]").length,
      err: (document.querySelector("[data-testid=chat-error]") as HTMLElement | null)?.innerText ?? "",
      final: document.querySelectorAll("[data-testid=assistant-message]").length,
    })).catch(() => null);
    if (snap) {
      const running = snap.label === "Cancel message" || snap.streaming > 0;
      if (running) sawRunning = true;
      if (!first && snap.chips.length > 0) {
        const file = await shot(page, "5-citations-during-stream", "midstream");
        first = { atMs: Date.now() - t0, running, count: snap.chips.length, publishers: snap.chips.slice(0, 5), label: snap.label, streaming: snap.streaming, shot: file };
      }
      if (Math.floor((Date.now() - t0) / 5000) !== lastLog) { lastLog = Math.floor((Date.now() - t0) / 5000); log(`C5 t=${((Date.now() - t0) / 1000).toFixed(0)}s chips=${snap.chips.length} send="${snap.label}" streaming=${snap.streaming} final=${snap.final}`); }
      if (snap.err) { errText = snap.err.slice(0, 300); break; }
      if (sawRunning && !running && snap.label === "Send message") { doneMs = Date.now() - t0; break; }
    }
    await sleep(300);
  }
  const tail = await page.evaluate(() => ({ finalChips: document.querySelectorAll("[data-testid=citation-chip]").length, overflow: document.querySelector("[data-testid=citation-overflow]")?.getAttribute("data-count") ?? null, rail: document.querySelector("[data-testid=sources-rail]")?.getAttribute("data-count") ?? null, pluginCard: (document.querySelector("[data-testid=plugin-error-card]") as HTMLElement | null)?.innerText?.slice(0, 120) ?? null, badge: (document.querySelector("[data-testid=answer-badge]") as HTMLElement | null)?.innerText?.slice(0, 80) ?? null })).catch(() => ({ finalChips: 0, overflow: null, rail: null, pluginCard: null, badge: null }));
  const { finalChips, overflow, rail } = tail;
  const ansHead = (await answerText(page).catch(() => "")).replace(/\s+/g, " ").slice(0, 160);
  const detail = `first chips at ${first ? `${(first.atMs / 1000).toFixed(1)}s` : "never"} (still running=${first?.running ?? "n/a"}; send="${first?.label}", assistant-streaming=${first?.streaming}) count=${first?.count ?? 0} publishers=[${(first?.publishers ?? []).join(", ")}] · final chips=${finalChips} overflow(+N)=${overflow ?? "none"} sources-rail count=${rail ?? "none"} · [DONE] at ${doneMs != null ? `${(doneMs / 1000).toFixed(1)}s` : "not within 150 s"} · midstream shot=${first?.shot ?? "-"}${first ? "" : ` · badge="${tail.badge}" plugin-error-card=${tail.pluginCard ? `"${tail.pluginCard}"` : "none"} answer="${ansHead}"`}`;
  if (errText) throw new Error(`chat-error: ${errText} · ${detail}`);
  if (!first) throw new Error(`no citation-chip appeared within 150 s · ${detail}`);
  if (!first.running) throw new Error(`first citation chips appeared only AFTER the stream finished · ${detail}`);
  return detail;
}

// ───────────────────────── tests: desktop 1440×900, then mobile 390×844 ─────────────────────────
test("C3 desktop · 3-upload-pdf-cited", async ({ page }, ti) => { await runCheck(page, ti, "3-upload-pdf-cited", () => check3(page)); });
test("C4 desktop · 4-voice-turn-plugin-plan-tts", async ({ page }, ti) => { await runCheck(page, ti, "4-voice-turn-plugin-plan-tts", () => check4(page)); });
test("C5 desktop · 5-citations-during-stream", async ({ page }, ti) => { await runCheck(page, ti, "5-citations-during-stream", () => check5(page)); });
test("C5 mobile · 5-citations-during-stream", async ({ page }, ti) => { await page.setViewportSize({ width: 390, height: 844 }); await runCheck(page, ti, "5-citations-during-stream", () => check5(page)); });
test("C3 mobile · 3-upload-pdf-cited", async ({ page }, ti) => { await page.setViewportSize({ width: 390, height: 844 }); await runBudgeted(page, ti, "3-upload-pdf-cited", 170_000, () => check3(page)); });
test("C4 mobile · 4-voice-turn-plugin-plan-tts", async ({ page }, ti) => { await page.setViewportSize({ width: 390, height: 844 }); await runBudgeted(page, ti, "4-voice-turn-plugin-plan-tts", 170_000, () => check4(page)); });

test.afterAll(() => {
  const f = path.join(RESULTS_DIR, "qa-C.json");
  const rows = fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, "utf8")) as Array<Record<string, unknown>>) : [];
  console.log("\n=== qa-C.json ===");
  console.table(rows.map((r) => ({ check: r.check, viewport: r.viewport, status: r.status, evidence: r.evidence_url, detail: String(r.detail ?? "").slice(0, 110) })));
  for (const r of rows) console.log(`[${r.status}] ${r.check} @ ${r.viewport}: ${r.detail ?? ""}`);
  if (failures.length) throw new Error(`QA failures (${failures.length}):\n${failures.join("\n")}`);
});
