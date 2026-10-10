/**
 * Run-UX recorder — ONE chat session, TWO turns, per viewport project (desktop 1440×900, mobile 390×844), plus the GROWTH grid check.
 * Everything visible is timestamped from the moment Enter is pressed (window.__ux.mark) by tests/e2e/ux-init.js (fetch tap + MutationObserver +
 * PerformanceObserver) and by a CDP Network listener on this side. Outputs (web/artifacts/):
 *   frames-<label>-turn<N>-<viewport>.jsonl         every SSE frame of the /api/chat bridge, ms-stamped
 *   raw-<label>-turn<N>-<viewport>.json             mutations / first-seen / layout-shift / LoAF / plugin states / CDP chunks for that turn
 *   timeline-<label>-<viewport>.json                 the per-turn timeline keys + smoothness metrics + GROWTH assertions
 *   <label>/screenshots/<name>-<viewport>.png        named milestone screenshots
 * Run: RUN_LABEL=before BASE_URL=https://… node node_modules/@playwright/test/cli.js test -c playwright.ux.config.ts
 */
import { test, expect, type Page, type CDPSession } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const LABEL = process.env.RUN_LABEL ?? "before";
const ART = path.resolve(__dirname, "..", "..", "artifacts");
const SHOTS = path.join(ART, LABEL, "screenshots");
const PROMPTS = [
  "What is the latest news about Fervo Energy? Cite sources.",
  "Compare the latest funding and project news of Fervo Energy and Ormat Technologies, then give me a one-paragraph summary with citations.",
];
const STREAM_MAX_MS = Number(process.env.STREAM_MAX_MS ?? 300_000);
const PERPLEXITY = "plugin-1722260873";

type Frame = { turn: number; tMs: number; wallIso: string; raw: string; type?: string | null; name?: string | null; phase?: string | null; statusType?: string | null; toolCallId?: string | null; toolCallName?: string | null; deltaLen?: number | null };
type Seen = Record<string, { t: number; rel: number | null; iso: string; inView: boolean; text: string; node: string }>;
type Raw = {
  frames: Frame[]; mutations: { t: number; rel: number | null; filler: number; content: number; visible: boolean; targets: string[] }[]; firstSeen: Seen;
  pluginStates: { pluginId: string | null; state: string | null; rel: number | null; text: string }[];
  perf: { layoutShifts: { t: number; rel: number | null; value: number; hadRecentInput: boolean; nodes: { node: string | null }[] }[]; loaf: { rel: number | null; dur: number; blocking: number; scripts: string[] }[]; longTasks: { rel: number | null; dur: number }[] };
  request: { body: unknown; status: number | null; headersAt: number | null }; fillerSamples: { rel: number | null; animating: boolean; kinds: string[] }[]; loafSupported: boolean; sendWall: number | null;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hexToRgb = (hex: string) => { const h = hex.trim().replace("#", ""); const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`; };
const isBlue = (c: string) => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(c); if (!m) return false; const [r, g, b] = [+m[1], +m[2], +m[3]]; const a = m[4] == null ? 1 : +m[4]; return a > 0.05 && b > r + 40 && b > g + 25 && b > 120; };

async function shot(page: Page, name: string, viewport: string, taken: Set<string>, notes: string[]) {
  if (taken.has(name)) return; taken.add(name);
  try { await page.screenshot({ path: path.join(SHOTS, `${name}-${viewport}.png`), fullPage: false, timeout: 8_000, animations: "allow" }); } catch (e) { notes.push(`screenshot ${name} failed: ${(e as Error).message.slice(0, 120)}`); }
}

type TurnResult = { timeline: Record<string, unknown>; metrics: Record<string, unknown>; errors: { console: { text: string; at: string }[]; page: { message: string; at: string }[]; failedRequests: { url: string; status: number | null; error?: string; favicon: boolean }[] } };

async function runTurn(page: Page, cdp: CDPSession, turn: number, viewport: string, taken: Set<string>, notes: string[], collectors: { console: { text: string; at: string }[]; page: { message: string; at: string }[]; failed: { url: string; status: number | null; error?: string; favicon: boolean; at: string }[] }, cdpChunks: { requestId: string; rel: number; bytes: number }[]): Promise<TurnResult> {
  const prompt = PROMPTS[turn - 1];
  const ta = page.locator("textarea:visible").first();
  await ta.scrollIntoViewIfNeeded(); await ta.click(); await ta.fill(prompt);
  await page.evaluate(() => (window as unknown as { __ux: { reset: () => void } }).__ux.reset());
  cdpChunks.length = 0;
  const errBefore = { c: collectors.console.length, p: collectors.page.length, f: collectors.failed.length };
  const sendWall = Date.now();
  await page.evaluate(([t, p]) => (window as unknown as { __ux: { mark: (t: number, p: string) => void } }).__ux.mark(Number(t), String(p)), [turn, prompt] as const);
  await ta.press("Enter");
  const submit = page.locator('button[data-testid=composer-send]:visible, button[aria-label="Send message"]:visible, button[aria-label="Cancel message"]:visible').first();
  const state = async () => page.evaluate(() => { const u = (window as unknown as { __ux: Raw }).__ux; const done = u.frames.find((f) => f.type === "[DONE]" || f.type === "STREAM_CLOSED" || f.type === "STREAM_ERROR"); return { n: u.frames.length, done: !!done, doneT: done?.tMs ?? null, seen: u.firstSeen, states: u.pluginStates }; });
  let doneWall: number | null = null; let labelResetWall: number | null = null; let cancelSeen = false;
  while (Date.now() - sendWall < STREAM_MAX_MS) {
    const s = await state(); const seen = s.seen;
    const lb = await submit.getAttribute("aria-label").catch(() => null); if (lb === "Cancel message") cancelSeen = true;
    if (seen.plugin_searching || (seen.plugin_card && !seen.plugin_searched)) await shot(page, "chat-favicon-strip-running", viewport, taken, notes);
    if (seen.summarising_pill) await shot(page, "chat-summarising-pill", viewport, taken, notes);
    if (seen.summary_done) await shot(page, "chat-step-collapsed", viewport, taken, notes);
    if (seen.citation_chip) await shot(page, "chat-inline-citation-chip", viewport, taken, notes);
    if (seen.sources_rail_nonempty && !s.done) await shot(page, "chat-sources-rail-partial", viewport, taken, notes);
    if (seen.chat_error || seen.plugin_error_card) await shot(page, "chat-error-card", viewport, taken, notes);
    if (seen.filler) await shot(page, "chat-working-band", viewport, taken, notes);
    if (seen.plan_stepper) await shot(page, "chat-plan-stepper", viewport, taken, notes);
    if (s.done) { doneWall = Date.now(); break; }
    if (lb === "Send message" && cancelSeen && s.n > 0) { await sleep(1200); const s2 = await state(); if (!s2.done) { notes.push(`turn ${turn}: composer reset to Send without a terminal frame`); doneWall = Date.now(); break; } }
    if (Date.now() - sendWall > 25_000 && s.n === 0 && !cancelSeen) { notes.push(`turn ${turn}: no /api/chat traffic within 25 s`); break; }
    await sleep(200);
  }
  if (doneWall == null) notes.push(`turn ${turn}: stream wait timed out after ${STREAM_MAX_MS} ms`);
  for (let i = 0; i < 100; i++) { const lb = await submit.getAttribute("aria-label").catch(() => null); if (lb === "Send message") { labelResetWall = Date.now(); break; } await sleep(100); }
  await sleep(700);
  // Final-state shots: badge (always), collapsed step (fallback: a done plan step), error card if the run failed.
  const seenEnd = (await state()).seen;
  await shot(page, "chat-final-badge", viewport, taken, notes);
  if (!taken.has("chat-step-collapsed") && (await page.locator("[data-testid=plan-step][data-state=done], [data-testid=step-summary]").count())) await shot(page, "chat-step-collapsed", viewport, taken, notes);
  if ((seenEnd.chat_error || seenEnd.plugin_error_card)) await shot(page, "chat-error-card", viewport, taken, notes);
  if (seenEnd.citation_chip) await shot(page, "chat-inline-citation-chip", viewport, taken, notes);
  // Request-body disclosure + model row (run rail; below the thread on mobile).
  let requestBodyDisclosed = false; let requestBodyKeys: string[] = []; let modelRowText: string | null = null;
  try {
    const disc = page.locator("[data-testid=request-disclosure]").first();
    if (await disc.count()) { await disc.scrollIntoViewIfNeeded(); if ((await disc.getAttribute("aria-expanded")) !== "true") await disc.click(); const body = page.locator("[data-testid=request-body]").first(); await body.waitFor({ timeout: 3_000 }); const txt = (await body.textContent()) ?? ""; try { const j = JSON.parse(txt) as Record<string, unknown>; requestBodyKeys = Object.keys(j); requestBodyDisclosed = requestBodyKeys.length > 0; } catch { requestBodyDisclosed = txt.trim().length > 0; } await shot(page, "run-rail-request-disclosed", viewport, taken, notes); }
    modelRowText = (await page.locator("[data-testid=run-model]").first().textContent({ timeout: 2_000 }).catch(() => null))?.replace(/\s+/g, " ").trim() ?? null;
    if (await page.locator("[data-testid=sidebar-plugins]").count()) { await page.locator("[data-testid=sidebar-plugins]").first().scrollIntoViewIfNeeded(); await shot(page, "plugin-picker-rail", viewport, taken, notes); }
    await page.locator("[data-testid=chat-shell]").first().scrollIntoViewIfNeeded().catch(() => {});
  } catch (e) { notes.push(`turn ${turn}: rail read failed: ${(e as Error).message.slice(0, 120)}`); }

  // ---- collect browser buffers --------------------------------------------------------------------------------
  const raw = await page.evaluate(() => { const u = (window as unknown as { __ux: Raw }).__ux; return { frames: u.frames, mutations: u.mutations, firstSeen: u.firstSeen, pluginStates: u.pluginStates, perf: u.perf, request: u.request, fillerSamples: u.fillerSamples, loafSupported: u.loafSupported, sendWall: u.sendWall } as Raw; });
  fs.writeFileSync(path.join(ART, `frames-${LABEL}-turn${turn}-${viewport}.jsonl`), raw.frames.map((f) => JSON.stringify(f)).join("\n") + "\n");
  const F = raw.frames; const first = (p: (f: Frame) => boolean) => F.find(p) ?? null;
  const doneF = first((f) => f.type === "[DONE]") ?? first((f) => f.type === "RUN_FINISHED") ?? first((f) => f.type === "RUN_ERROR") ?? first((f) => f.type === "STREAM_CLOSED");
  const endMs = doneF?.tMs ?? (doneWall ? doneWall - sendWall : Date.now() - sendWall);
  const parse = (f: Frame) => { try { return JSON.parse(f.raw) as Record<string, unknown>; } catch { return {}; } };
  // plugins: TOOL_CALL_START → TOOL_CALL_RESULT (status from the result JSON / isError); DOM states appended.
  const plugins: Record<string, unknown>[] = [];
  for (const f of F.filter((x) => x.type === "TOOL_CALL_START")) {
    const args = F.find((x) => x.type === "TOOL_CALL_ARGS" && x.toolCallId === f.toolCallId); let pid: string | null = null; let query: string | null = null;
    if (args) { try { const a = JSON.parse(String(parse(args).delta ?? "{}")) as { pluginId?: string; query?: string }; pid = a.pluginId ?? null; query = a.query ?? null; } catch { /* noop */ } }
    const res = F.find((x) => x.type === "TOOL_CALL_RESULT" && x.toolCallId === f.toolCallId); let status: "ok" | "error" | "open" = "open"; let message: string | null = null; let sources: number | null = null;
    if (res) { const r = parse(res); try { const c = JSON.parse(String(r.content ?? "{}")) as { status?: string; message?: string; sources?: number }; status = r.isError || c.status === "error" ? "error" : "ok"; message = c.message ?? null; sources = c.sources ?? null; } catch { status = r.isError ? "error" : "ok"; } }
    const dom = raw.pluginStates.filter((s) => s.pluginId === pid).map((s) => ({ state: s.state, ms: s.rel }));
    plugins.push({ name: f.toolCallName, id: pid, start_ms: f.tMs, end_ms: res?.tMs ?? null, status, message, sources, query, dom_states: dom });
  }
  const errFrame = first((f) => f.type === "CUSTOM" && f.name === "ondemand.error");
  const errVal = errFrame ? (parse(errFrame).value as { code?: string; message?: string } | undefined) : undefined;
  const summaryStart = first((f) => f.type === "CUSTOM" && f.name === "ondemand.summary" && f.phase === "start");
  const summaryDone = first((f) => f.type === "CUSTOM" && f.name === "ondemand.summary" && f.phase === "done");
  const planF = first((f) => f.type === "CUSTOM" && f.name === "ondemand.plan");
  const firstTok = first((f) => f.type === "TEXT_MESSAGE_CONTENT");
  const seen = raw.firstSeen; const rel = (k: string) => seen[k]?.rel ?? null;
  const frameTypes: Record<string, number> = {}; for (const f of F) { const k = `${f.type ?? "?"}${f.name ? ":" + f.name : ""}${f.phase ? "#" + f.phase : ""}`; frameTypes[k] = (frameTypes[k] ?? 0) + 1; }
  const statusTypes: Record<string, number> = {}; for (const f of F) if (f.statusType) statusTypes[f.statusType] = (statusTypes[f.statusType] ?? 0) + 1;
  const timeline = {
    turn, prompt, viewport, sent_utc: new Date(sendWall).toISOString(),
    first_sse_frame: F[0]?.tMs ?? null, first_sse_frame_type: F[0] ? `${F[0].type}${F[0].name ? ":" + F[0].name : ""}` : null,
    first_thinking_visible: rel("thinking_trace"),
    plugins,
    plan_created: planF?.tMs ?? null, plan_visible: rel("plan_stepper"),
    first_between_step_summary: summaryStart?.tMs ?? null, first_between_step_summary_visible: rel("summarising_pill"), between_step_summary_done: summaryDone?.tMs ?? null, summary_done_visible: rel("summary_done"),
    first_inline_citation_chip: rel("citation_chip"),
    first_answer_token: firstTok?.tMs ?? null, first_answer_paint: rel("answer_markdown") ?? rel("assistant_streaming"),
    first_source_in_rail: rel("sources_rail_nonempty"), final_badge_visible: rel("answer_badge"), error_card_visible: rel("chat_error") ?? rel("plugin_error_card"),
    done: doneF?.tMs ?? null, done_frame_type: doneF?.type ?? null, total_ms: (labelResetWall ?? doneWall ?? Date.now()) - sendWall, composer_reset_ms: labelResetWall ? labelResetWall - sendWall : null,
    request_body_disclosed: requestBodyDisclosed, request_body_keys: requestBodyKeys, model_row_text: modelRowText,
    bridge_request_body: raw.request.body, bridge_http_status: raw.request.status, bridge_headers_at_ms: raw.request.headersAt,
    frame_count: F.length, frame_types: frameTypes, status_types_seen: statusTypes,
    perplexity: { status: plugins.find((p) => p.id === PERPLEXITY)?.status ?? "not-called", error: errVal ?? null, error_card_shown: !!(seen.chat_error || seen.plugin_error_card), substituted: plugins.some((p) => p.id !== PERPLEXITY && p.status === "ok") },
    cdp_chunks: cdpChunks.length, cdp_first_chunk_ms: cdpChunks[0]?.rel ?? null,
  };
  // ---- smoothness metrics over the stream window [0, endMs] ------------------------------------------------------
  const inWin = (r: number | null) => r != null && r >= 0 && r <= endMs + 500;
  const visibleChanges = raw.mutations.filter((m) => inWin(m.rel) && m.visible).map((m) => m.rel as number).sort((a, b) => a - b);
  const fillerChanges = raw.mutations.filter((m) => inWin(m.rel) && m.filler > 0).map((m) => m.rel as number);
  const animSamples = raw.fillerSamples.filter((s) => inWin(s.rel) && s.animating).map((s) => s.rel as number);
  const timeline_pts = [0, ...visibleChanges, endMs];
  const gapsAll: { from: number; to: number; ms: number; filler_change: boolean; filler_animating: boolean }[] = [];
  for (let i = 1; i < timeline_pts.length; i++) { const a = timeline_pts[i - 1], b = timeline_pts[i]; if (b - a > 800) gapsAll.push({ from: +a.toFixed(0), to: +b.toFixed(0), ms: +(b - a).toFixed(0), filler_change: fillerChanges.some((x) => x > a && x < b), filler_animating: animSamples.some((x) => x > a && x < b) }); }
  const deadAir = gapsAll.filter((g) => !g.filler_change && !g.filler_animating);
  const ls = raw.perf.layoutShifts.filter((e) => inWin(e.rel) && !e.hadRecentInput);
  const byNode: Record<string, number> = {}; for (const e of ls) for (const n of e.nodes) if (n.node) byNode[n.node] = (byNode[n.node] ?? 0) + e.value;
  const topNodes = Object.entries(byNode).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([node, value]) => ({ node, value: +value.toFixed(4) }));
  const loaf = raw.perf.loaf.filter((e) => inWin(e.rel) && e.dur > 50); const lt = raw.perf.longTasks.filter((e) => inWin(e.rel) && e.dur > 50);
  const longFrames = raw.loafSupported ? loaf : lt;
  const consoleErrs = collectors.console.slice(errBefore.c); const pageErrs = collectors.page.slice(errBefore.p); const failed = collectors.failed.slice(errBefore.f);
  const metrics = {
    stream_window_ms: +endMs.toFixed(0), visible_dom_changes: visibleChanges.length,
    dead_air_gaps: { count: deadAir.length, gaps: deadAir, gaps_over_800_any: gapsAll.length, gaps_bridged_by_filler: gapsAll.length - deadAir.length, max_gap_ms: gapsAll.length ? Math.max(...gapsAll.map((g) => g.ms)) : 0 },
    cumulative_layout_shift: { value: +ls.reduce((a, e) => a + e.value, 0).toFixed(4), shifts: ls.length, top_nodes: topNodes, largest: ls.slice().sort((a, b) => b.value - a.value).slice(0, 3).map((e) => ({ ms: e.rel, value: e.value, nodes: e.nodes.map((n) => n.node) })) },
    scroll_jank: { source: raw.loafSupported ? "long-animation-frame" : "longtask", long_frames_over_50ms: longFrames.length, max_ms: longFrames.length ? Math.max(...longFrames.map((e) => e.dur)) : 0, total_ms: +longFrames.reduce((a, e) => a + e.dur, 0).toFixed(0), top: longFrames.slice().sort((a, b) => b.dur - a.dur).slice(0, 3) },
    console_errors: { count: consoleErrs.length, messages: consoleErrs.map((e) => e.text.slice(0, 200)) }, page_errors: { count: pageErrs.length, messages: pageErrs.map((e) => e.message.slice(0, 200)) },
    failed_requests: { count: failed.length, favicon_failures: failed.filter((f) => f.favicon).length, urls: failed.map((f) => `${f.status ?? f.error ?? "?"} ${f.url}`) },
  };
  fs.writeFileSync(path.join(ART, `raw-${LABEL}-turn${turn}-${viewport}.json`), JSON.stringify({ turn, viewport, sendWall, endMs, firstSeen: raw.firstSeen, pluginStates: raw.pluginStates, mutations: raw.mutations, layoutShifts: raw.perf.layoutShifts, loaf: raw.perf.loaf, longTasks: raw.perf.longTasks, fillerSamples: raw.fillerSamples, cdpChunks: [...cdpChunks], request: raw.request }));
  return { timeline, metrics, errors: { console: consoleErrs, page: pageErrs, failedRequests: failed } };
}

async function growthCheck(page: Page, viewport: string, taken: Set<string>, notes: string[]) {
  const g: Record<string, unknown> = { url: null, assertions: [] as { name: string; ok: boolean; expected?: unknown; observed?: unknown }[] };
  const A = g.assertions as { name: string; ok: boolean; expected?: unknown; observed?: unknown }[];
  const push = (name: string, ok: boolean, expected?: unknown, observed?: unknown) => { A.push({ name, ok, expected, observed }); expect.soft(ok, `${name} expected=${JSON.stringify(expected)} observed=${JSON.stringify(observed)}`).toBeTruthy(); };
  await page.goto("/onboarding?skip=1", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-testid=growth-grid]", { timeout: 60_000 });
  g.url = page.url();
  const tok = await page.evaluate(() => { const cs = getComputedStyle(document.documentElement); return { green: cs.getPropertyValue("--brand-green").trim(), ink: cs.getPropertyValue("--brand-green-ink").trim(), soft: cs.getPropertyValue("--brand-green-soft").trim() }; });
  const GREEN = hexToRgb(tok.green || "#0AC985"), INK = hexToRgb(tok.ink || "#047857");
  g.tokens = { ...tok, expected_tile_rgb: GREEN, expected_chevron_rgb: INK, spec_tile_rgb: "rgb(10, 201, 133)", spec_chevron_rgb: "rgb(4, 120, 87)" };
  push("token --brand-green equals spec rgb(10, 201, 133)", GREEN === "rgb(10, 201, 133)", "rgb(10, 201, 133)", GREEN);
  push("token --brand-green-ink equals spec rgb(4, 120, 87)", INK === "rgb(4, 120, 87)", "rgb(4, 120, 87)", INK);
  const values = page.locator("[data-testid=growth-value]"); const n = await values.count();
  push("six tiles rendered", n === 6, 6, n);
  const order = await values.evaluateAll((els) => els.map((e) => e.getAttribute("data-value")));
  const letters = await page.locator("[data-testid=growth-tile]").evaluateAll((els) => els.map((e) => (e.textContent ?? "").trim()));
  push("letters read G→R→O→W→T→H in DOM order", letters.join("") === "GROWTH", "GROWTH", letters.join(""));
  await page.locator("[data-testid=growth-grid]").scrollIntoViewIfNeeded(); await sleep(2600); // let the once-only light-up finish before measuring
  const readColors = (i: number) => page.evaluate((idx) => { const b = document.querySelectorAll("[data-testid=growth-value]")[idx] as HTMLElement; const item = b.closest(".growth-item") as HTMLElement; const tile = b.querySelector("[data-testid=growth-tile]") as HTMLElement; const chev = b.querySelector("[data-testid=growth-chevron]") as HTMLElement; const cs = getComputedStyle(b); return { border: getComputedStyle(item).borderTopColor, item_bg: getComputedStyle(item).backgroundColor, tile_bg: getComputedStyle(tile).backgroundColor, tile_border: getComputedStyle(tile).borderTopColor, chevron: getComputedStyle(chev).color, outline: cs.outlineColor, outline_style: cs.outlineStyle, outline_width: cs.outlineWidth, expanded: b.getAttribute("aria-expanded"), focus_visible: b.matches(":focus-visible"), rotate: getComputedStyle(chev).transform }; }, i);
  // hover
  await values.nth(0).hover(); await sleep(450);
  const hov = await readColors(0); g.hover = hov;
  push("hover: tile bg is brand green", hov.tile_bg === GREEN, GREEN, hov.tile_bg);
  push("hover: card border is brand green", hov.border === GREEN, GREEN, hov.border);
  push("hover: chevron is brand-green ink", hov.chevron === INK, INK, hov.chevron);
  await shot(page, "growth-green-hover", viewport, taken, notes);
  await page.mouse.move(2, 2); await sleep(300);
  // keyboard: Tab from a neutral anchor placed right before the grid
  await page.evaluate(() => { const grid = document.querySelector("[data-testid=growth-grid]") as HTMLElement; const a = document.createElement("button"); a.id = "__ux-anchor"; a.textContent = "anchor"; a.style.cssText = "position:absolute;opacity:0.01;width:1px;height:1px;"; grid.parentElement!.insertBefore(a, grid); a.focus(); });
  const reached: string[] = []; const focusStates: Record<string, unknown>[] = [];
  for (let i = 0; i < 12 && reached.length < 6; i++) {
    await page.keyboard.press("Tab"); await sleep(350);
    const f = await page.evaluate(() => { const a = document.activeElement as HTMLElement | null; return a?.getAttribute("data-testid") === "growth-value" ? a.getAttribute("data-value") : null; });
    if (f) { reached.push(f); const idx = order.indexOf(f); const c = await readColors(idx); focusStates.push({ value: f, ...c }); if (reached.length === 1) { push("focus-visible ring present on first tile", c.focus_visible && c.outline_style !== "none" && parseFloat(c.outline_width) > 0, { focusVisible: true, outline: ">0" }, { focus_visible: c.focus_visible, outline_style: c.outline_style, outline_width: c.outline_width }); push("focus: outline colour is brand green", c.outline === GREEN, GREEN, c.outline); push("focus: tile bg is brand green", c.tile_bg === GREEN, GREEN, c.tile_bg); } }
  }
  g.keyboard = { reached, focusStates };
  push("all six tiles reachable by Tab in G→R→O→W→T→H order", reached.join(",") === order.join(","), order, reached);
  // Shift+Tab back one tile
  await page.keyboard.press("Shift+Tab"); await sleep(250);
  const back = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute("data-value") ?? null);
  push("Shift+Tab moves focus back to the previous tile", back === order[4], order[4], back);
  // Enter expands; Space collapses; Enter expands again; Escape collapses (+ keeps focus)
  await values.nth(0).focus(); await sleep(200);
  await page.keyboard.press("Enter"); await sleep(500);
  const exp = await readColors(0); g.expanded = exp;
  push("Enter: aria-expanded toggles to true", exp.expanded === "true", "true", exp.expanded);
  push("expanded: tile bg is brand green", exp.tile_bg === GREEN, GREEN, exp.tile_bg);
  push("expanded: card border is brand green", exp.border === GREEN, GREEN, exp.border);
  push("expanded: chevron is brand-green ink", exp.chevron === INK, INK, exp.chevron);
  const panel = await page.evaluate(() => { const p = document.querySelector("[data-testid=growth-panel]") as HTMLElement; return { state: p.getAttribute("data-state"), hidden: p.getAttribute("aria-hidden"), lines: ["growth-definition", "growth-here", "growth-example"].map((t) => !!p.querySelector(`[data-testid=${t}]`)) }; });
  push("expanded panel open with three lines", panel.state === "open" && panel.hidden === "false" && panel.lines.every(Boolean), { state: "open", lines: [true, true, true] }, panel);
  await shot(page, "growth-expanded", viewport, taken, notes);
  await page.keyboard.press("Space"); await sleep(400);
  const afterSpace = await readColors(0); push("Space: aria-expanded toggles back to false", afterSpace.expanded === "false", "false", afterSpace.expanded);
  await page.keyboard.press("Enter"); await sleep(400);
  await page.keyboard.press("Escape"); await sleep(400);
  const afterEsc = await page.evaluate(() => { const b = document.querySelector("[data-testid=growth-value]") as HTMLElement; return { expanded: b.getAttribute("aria-expanded"), focused: document.activeElement === b }; });
  push("Escape collapses the expanded tile and keeps focus", afterEsc.expanded === "false" && afterEsc.focused, { expanded: "false", focused: true }, afterEsc);
  // no blue anywhere in the grid (every element, every state we just drove)
  const blues = await page.evaluate(() => { const out: { node: string; prop: string; value: string }[] = []; for (const el of Array.from(document.querySelectorAll("[data-testid=growth-grid], [data-testid=growth-grid] *"))) { const cs = getComputedStyle(el); for (const prop of ["color", "backgroundColor", "borderTopColor", "outlineColor"] as const) { const v = cs[prop]; const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(v); if (!m) continue; const [r, g, b] = [+m[1], +m[2], +m[3]]; const a = m[4] == null ? 1 : +m[4]; if (a > 0.05 && b > r + 40 && b > g + 25 && b > 120) out.push({ node: `${el.tagName.toLowerCase()}[${el.getAttribute("data-testid") ?? el.className}]`.slice(0, 80), prop, value: v }); } } return out; });
  push("no blue in the GROWTH grid", blues.length === 0, [], blues);
  void isBlue;
  g.pass = A.every((a) => a.ok); g.failed = A.filter((a) => !a.ok).map((a) => a.name);
  await page.evaluate(() => document.getElementById("__ux-anchor")?.remove());
  return g;
}

test(`run-ux ${LABEL}: GROWTH + one session, two turns`, async ({ page, context }, testInfo) => {
      const viewport = testInfo.project.name as "desktop" | "mobile";
      test.setTimeout(900_000);
      fs.mkdirSync(SHOTS, { recursive: true });
      const notes: string[] = []; const taken = new Set<string>();
      const collectors = { console: [] as { text: string; at: string }[], page: [] as { message: string; at: string }[], failed: [] as { url: string; status: number | null; error?: string; favicon: boolean; at: string }[] };
      const FAV = /favicon|logo|s2\/favicons|gstatic|\.(png|svg|ico|jpg|webp)(\?|$)/i;
      page.on("console", (m) => { if (m.type() === "error") collectors.console.push({ text: m.text(), at: new Date().toISOString() }); });
      page.on("pageerror", (e) => collectors.page.push({ message: String(e?.message ?? e), at: new Date().toISOString() }));
      page.on("response", (r) => { if (r.status() >= 400) collectors.failed.push({ url: r.url().slice(0, 240), status: r.status(), favicon: FAV.test(r.url()), at: new Date().toISOString() }); });
      page.on("requestfailed", (r) => { const t = r.failure()?.errorText ?? ""; if (/ERR_ABORTED/.test(t)) return; collectors.failed.push({ url: r.url().slice(0, 240), status: null, error: t, favicon: FAV.test(r.url()), at: new Date().toISOString() }); });
      await context.addInitScript({ path: path.join(__dirname, "ux-init.js") });
      // CDP Network listener: byte-level arrival of the /api/chat response, independent of the fetch tap.
      const cdp = await context.newCDPSession(page); await cdp.send("Network.enable");
      const cdpChunks: { requestId: string; rel: number; bytes: number }[] = []; let chatReq: string | null = null; let chatT0 = 0;
      cdp.on("Network.requestWillBeSent", (e) => { if (/\/api\/chat(\?|$)/.test(e.request.url)) { chatReq = e.requestId; chatT0 = e.timestamp * 1000; } });
      cdp.on("Network.dataReceived", (e) => { if (e.requestId === chatReq) cdpChunks.push({ requestId: e.requestId, rel: +(e.timestamp * 1000 - chatT0).toFixed(1), bytes: e.dataLength }); });

      const startedUtc = new Date().toISOString();
      const growth = await growthCheck(page, viewport, taken, notes);

      await page.goto("/chat?skip=1", { waitUntil: "domcontentloaded" });
      await page.waitForSelector("[data-testid=chat-shell]", { timeout: 60_000 });
      await page.waitForSelector("textarea:visible", { timeout: 60_000 });
      await sleep(1200);
      await shot(page, "chat-loaded", viewport, taken, notes);
      const t1 = await runTurn(page, cdp, 1, viewport, taken, notes, collectors, cdpChunks);
      await sleep(1500);
      const t2 = await runTurn(page, cdp, 2, viewport, taken, notes, collectors, cdpChunks);
      const sessionIds = await page.evaluate(() => { try { return Object.entries(localStorage).filter(([k]) => /session/i.test(k)).map(([k, v]) => `${k}=${String(v).slice(0, 80)}`); } catch { return []; } });
      const out = {
        label: LABEL, viewport, viewport_px: viewport === "desktop" ? "1440x900" : "390x844", base_url: testInfo.project.use.baseURL, started_utc: startedUtc, finished_utc: new Date().toISOString(), playwright_version: require("@playwright/test/package.json").version,
        turn1: t1.timeline, turn2: t2.timeline, metrics: { turn1: t1.metrics, turn2: t2.metrics }, growth, session_storage_keys: sessionIds, notes, screenshots: [...taken].map((n) => `${n}-${viewport}.png`),
      };
      fs.writeFileSync(path.join(ART, `timeline-${LABEL}-${viewport}.json`), JSON.stringify(out, null, 2));
      // Hard expectations that define a usable run (soft so the artifacts always get written; reported in results.json).
      expect.soft(t1.timeline.first_sse_frame, "turn 1 produced SSE frames").not.toBeNull();
      expect.soft(t2.timeline.first_sse_frame, "turn 2 produced SSE frames").not.toBeNull();
      expect.soft(t1.timeline.done, "turn 1 reached a terminal frame").not.toBeNull();
      expect.soft(t2.timeline.done, "turn 2 reached a terminal frame").not.toBeNull();
      await testInfo.attach(`timeline-${LABEL}-${viewport}.json`, { path: path.join(ART, `timeline-${LABEL}-${viewport}.json`), contentType: "application/json" });
    });
