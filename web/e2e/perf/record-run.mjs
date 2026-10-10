#!/usr/bin/env node
// Playwright perf recorder for the chat streaming flow + GROWTH grid.
// Usage: node e2e/perf/record-run.mjs --label before --viewport desktop|mobile --url https://host
// Outputs: web/proof/perf/<label>-<viewport>/{run.webm,run.mp4,trace.zip,run.har,sse-frames.json,metrics.json,*.png}
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(__dirname, '..', '..');
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true'] : []).filter(Boolean));
const label = args.label || 'run';
const viewportName = args.viewport || 'desktop';
const base = (args.url || 'http://localhost:3000').replace(/\/$/, '');
const PROMPT = args.prompt || 'Which of my context companies moved most since the last sentiment run, and why?';
const COMPANIES = ['Perplexity AI', 'Apptronik', 'Fervo Energy', 'Flutterwave', 'WRITER'];
const PLUGIN_IDS = ['plugin-1741871229', 'plugin-1748003575', 'plugin-1716429542'];
const STREAM_MAX_MS = Number(args.maxStreamMs || 240_000);
const out = path.join(WEB, 'proof', 'perf', `${label}-${viewportName}`);
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const vp = viewportName === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const log = (...a) => console.log(new Date().toISOString(), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (xs) => { const a = xs.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); return a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : null; };
const strip = (o) => { if (!o || typeof o !== 'object') return o; const c = Array.isArray(o) ? [] : {}; for (const k of Object.keys(o)) c[k] = /apikey|api_key|x-ondemand-key|authorization/i.test(k) ? '[stripped]' : strip(o[k]); return c; };

const metrics = { label, viewport: viewportName, viewportPx: vp, url: base, startedUtc: new Date().toISOString(), prompt: PROMPT, companies: null, pluginTogglesPresent: false, pluginTogglesChecked: [], faviconFailures: [], consoleErrors: [], pageErrors: [], notes: [] };
const shot = async (page, name) => { try { await page.screenshot({ path: path.join(out, name), fullPage: false, timeout: 10_000 }); log('screenshot', name); } catch (e) { metrics.notes.push(`screenshot ${name} failed: ${e.message}`); } };

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({
  viewport: vp, deviceScaleFactor: 1,
  ...(viewportName === 'mobile' ? { isMobile: true, hasTouch: true } : {}),
  recordVideo: { dir: out, size: vp },
  recordHar: { path: path.join(out, 'run.har'), content: 'embed' },
});
await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
await context.addInitScript({ path: path.join(__dirname, 'init-script.js') });
const page = await context.newPage();
const cdp0 = await context.newCDPSession(page); await cdp0.send('Performance.enable');
const RES_RE = /favicon|logo|s2\/favicons|gstatic|\.(png|svg|ico|jpg|webp)(\?|$)/i;
page.on('response', (r) => { if (r.status() >= 400 && RES_RE.test(r.url())) metrics.faviconFailures.push({ url: r.url().slice(0, 300), status: r.status(), at: new Date().toISOString() }); });
page.on('requestfailed', (r) => { if (RES_RE.test(r.url())) metrics.faviconFailures.push({ url: r.url().slice(0, 300), status: null, error: r.failure()?.errorText, at: new Date().toISOString() }); });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') { const text = m.text(); const loc = m.location?.(); const thirdParty = loc?.url && !loc.url.startsWith(base) && !loc.url.startsWith('/') ? loc.url : null; metrics.consoleErrors.push({ type: m.type(), text: text.slice(0, 500), url: loc?.url?.slice(0, 200), thirdParty: !!thirdParty || /Failed to load resource/.test(text) && !/\/api\//.test(text), at: new Date().toISOString() }); } });
page.on('pageerror', (e) => metrics.pageErrors.push({ message: String(e?.message || e).slice(0, 500), stack: String(e?.stack || '').slice(0, 800), at: new Date().toISOString() }));

const hardTimer = setTimeout(() => { log('HARD TIMEOUT — writing partial outputs'); metrics.notes.push('hard timeout 330s reached'); finish(1).catch(() => process.exit(2)); }, 330_000);

let finished = false;
async function finish(code = 0) {
  if (finished) return; finished = true; clearTimeout(hardTimer);
  try { if (!page.isClosed()) { const { metrics: m } = await cdp0.send('Performance.getMetrics'); const pick = Object.fromEntries(m.map((x) => [x.name, x.value])); metrics.cdpMetrics = { LayoutCount: pick.LayoutCount, RecalcStyleCount: pick.RecalcStyleCount, JSHeapUsedSize: pick.JSHeapUsedSize, TaskDuration: pick.TaskDuration, ScriptDuration: pick.ScriptDuration, LayoutDuration: pick.LayoutDuration, Nodes: pick.Nodes }; } } catch (e) { metrics.notes.push(`cdp failed: ${e.message}`); }
  try { await context.tracing.stop({ path: path.join(out, 'trace.zip') }); } catch (e) { metrics.notes.push(`tracing.stop failed: ${e.message}`); }
  let videoPath = null; try { videoPath = await page.video()?.path(); } catch {}
  try { await context.close(); } catch (e) { metrics.notes.push(`context.close failed: ${e.message}`); }
  try { await browser.close(); } catch {}
  try {
    const webm = path.join(out, 'run.webm');
    if (videoPath && fs.existsSync(videoPath)) fs.renameSync(videoPath, webm); else { const v = fs.readdirSync(out).find((f) => f.endsWith('.webm') && f !== 'run.webm'); if (v) fs.renameSync(path.join(out, v), webm); }
    if (fs.existsSync(webm)) execFileSync('/usr/bin/ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(out, 'run.mp4')], { stdio: 'inherit' });
  } catch (e) { metrics.notes.push(`video/ffmpeg failed: ${e.message}`); }
  metrics.finishedUtc = new Date().toISOString();
  fs.writeFileSync(path.join(out, 'metrics.json'), JSON.stringify(metrics, null, 2));
  log('wrote', path.join(out, 'metrics.json'));
  process.exit(code);
}

try {
  // ---------- 1. load chat ----------
  await page.goto(`${base}/chat?skip=1`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.chat-shell', { timeout: 60_000 });
  await page.waitForTimeout(800);
  await shot(page, '00-loaded.png');

  // ---------- 2. ensure the five companies ----------
  const chipTexts = async () => page.$$eval('[data-testid=company-chip]', (els) => els.map((e) => (e.textContent || '').replace(/Remove .*$/, '').trim()));
  let chips = await chipTexts();
  metrics.companiesInitial = chips;
  if (!chips.length && viewportName === 'mobile') { // context card may be collapsed behind a disclosure on mobile
    const btn = page.locator('button', { hasText: /context|companies/i }).first(); if (await btn.count()) { await btn.click().catch(() => {}); await page.waitForTimeout(400); chips = await chipTexts(); }
  }
  for (const c of chips) if (!COMPANIES.includes(c)) { await page.locator(`[data-testid=company-chip] button[aria-label="Remove ${c}"]`).first().click().catch(() => {}); await page.waitForTimeout(200); }
  chips = await chipTexts();
  for (const c of COMPANIES) if (!chips.includes(c)) {
    const inp = page.locator('#company-search'); if (!(await inp.count())) break;
    await inp.fill(c.slice(0, 6)); await page.waitForTimeout(250);
    const opt = page.locator('[role=option] button', { hasText: c }).first();
    if (await opt.count()) await opt.click(); else await inp.press('Enter');
    await page.waitForTimeout(250);
  }
  metrics.companies = await chipTexts();
  metrics.companyCountText = await page.locator('[data-testid=company-picker-count]').first().textContent().catch(() => null);

  // ---------- plugins ----------
  const toggles = page.locator('[data-testid=plugin-toggle]');
  metrics.pluginTogglesPresent = (await toggles.count()) > 0;
  if (metrics.pluginTogglesPresent) {
    for (const id of PLUGIN_IDS) {
      const t = page.locator(`[data-testid=plugin-toggle][data-plugin-id="${id}"]`).first();
      if (await t.count()) { const checked = await t.getAttribute('aria-checked'); if (checked !== 'true') { await t.click(); await page.waitForTimeout(150); } }
      else metrics.notes.push(`toggle ${id} not found`);
    }
    metrics.pluginTogglesChecked = await page.$$eval('[data-testid=plugin-toggle]', (els) => els.filter((e) => e.getAttribute('aria-checked') === 'true').map((e) => e.getAttribute('data-plugin-id')));
  }
  metrics.pluginsCardText = await page.locator('[data-testid=sidebar-plugins]').first().textContent().catch(() => null);
  await shot(page, '01-plugins.png');

  // ---------- 3. send prompt + stream ----------
  const ta = page.locator('textarea:visible').first();
  await ta.click(); await ta.fill(PROMPT);
  const submitSel = 'button.openui-agent-thread-composer__submit-button:visible, button[aria-label="Send message"]:visible, button[aria-label="Cancel message"]:visible';
  const submit = page.locator(submitSel).first();
  await page.evaluate(() => { window.__sendT0 = performance.now(); window.__rafOn = true; window.__sendIso = new Date().toISOString(); });
  metrics.sentUtc = new Date().toISOString();
  const wallT0 = Date.now();
  await ta.press('Enter');
  const sinceSend = () => Date.now() - wallT0;
  const label_ = async () => submit.getAttribute('aria-label').catch(() => null);
  const seen = async () => page.evaluate(() => window.__firstSeen);
  const sseState = async () => page.evaluate(() => ({ n: window.__sse.length, done: window.__sse.some((f) => f.type === '[DONE]' || f.type === 'RUN_FINISHED' || f.type === 'STREAM_CLOSED' || f.type === 'RUN_ERROR'), doneT: (window.__sse.find((f) => f.type === '[DONE]') || window.__sse.find((f) => f.type === 'RUN_FINISHED') || window.__sse.find((f) => f.type === 'STREAM_CLOSED'))?.tMs ?? null }));
  const timed = { 500: '02-t0.5s.png', 1000: '03-t1s.png', 3000: '04-t3s.png', 10000: '05-t10s.png' };
  const taken = new Set(); let streamDoneAt = null; let labelResetAt = null; let labelFlipped = false; let labelCancelSeen = false;
  metrics.submitLabels = [];
  while (sinceSend() < STREAM_MAX_MS) {
    const el = sinceSend();
    for (const [ms, name] of Object.entries(timed)) if (el >= Number(ms) && !taken.has(name)) { taken.add(name); await shot(page, name); }
    const fs_ = await seen();
    if (fs_['[data-testid=plugin-activity]'] && !taken.has('midstream-toolcard.png')) { taken.add('midstream-toolcard.png'); await shot(page, 'midstream-toolcard.png'); }
    if (fs_['[data-testid=citation-chip]'] && !taken.has('midstream-citations.png')) { taken.add('midstream-citations.png'); await shot(page, 'midstream-citations.png'); }
    if (fs_['[data-testid=step-summary]'] && !taken.has('step-summary.png')) { taken.add('step-summary.png'); await shot(page, 'step-summary.png'); }
    const lb = await label_(); if (lb && metrics.submitLabels[metrics.submitLabels.length - 1]?.label !== lb) metrics.submitLabels.push({ label: lb, atMs: el });
    if (lb === 'Cancel message') labelCancelSeen = true;
    const s = await sseState();
    if (s.done && streamDoneAt == null) { streamDoneAt = Date.now(); metrics.streamDoneWallMs = el; }
    if (streamDoneAt != null) {
      // fast-poll phase for the label flip
      while (Date.now() - streamDoneAt < 15_000) { const l2 = await label_(); if (l2 === 'Send message') { labelResetAt = Date.now(); labelFlipped = true; break; } await sleep(50); }
      break;
    }
    if (lb === 'Send message' && labelCancelSeen && s.n > 0) { // stream ended without DONE frame (error path)
      await sleep(1500); const s2 = await sseState(); if (!s2.done) { metrics.notes.push('button reset to Send message without [DONE]/RUN_FINISHED frame'); labelResetAt = Date.now(); labelFlipped = true; break; }
    }
    if (el > 20_000 && lb === 'Send message' && !labelCancelSeen && s.n === 0) { metrics.notes.push('no /api/chat fetch observed within 20s and button never flipped to Cancel'); break; }
    await sleep(200);
  }
  if (sinceSend() >= STREAM_MAX_MS) metrics.notes.push(`stream wait timed out after ${STREAM_MAX_MS} ms`);
  const s = await sseState();
  metrics.stopToSendResetMs = streamDoneAt != null && labelResetAt != null ? labelResetAt - streamDoneAt : null;
  metrics.submitLabelResetObserved = labelFlipped;
  await sleep(600);
  await shot(page, 'final.png');
  await page.evaluate(() => { window.__rafOn = false; });

  // ---------- collect browser-side buffers ----------
  const data = await page.evaluate(() => ({ perf: window.__perf, raf: window.__raf, sse: window.__sse, sseMeta: window.__sseMeta, firstSeen: window.__firstSeen, scroll: window.__scroll, pluginStates: window.__pluginStates, sendT0: window.__sendT0 }));
  const frames = data.sse.map((f) => ({ tMs: f.tMs, isoUtc: f.isoUtc, type: f.type, name: f.name, eventType: f.eventType, statusType: f.statusType, raw: f.raw, parsed: f.parsed }));
  fs.writeFileSync(path.join(out, 'sse-frames.json'), JSON.stringify(frames, null, 1));
  fs.copyFileSync(path.join(out, 'sse-frames.json'), path.join(WEB, 'proof', `sse-frames-${label}-${viewportName}.json`));
  const fsn = (sel) => data.firstSeen[sel]?.sinceSend ?? null;
  const first = (pred) => data.sse.find(pred);
  const doneF = first((f) => f.type === '[DONE]') || first((f) => f.type === 'RUN_FINISHED') || first((f) => f.type === 'STREAM_CLOSED');
  const firstTok = first((f) => f.type === 'TEXT_MESSAGE_CONTENT');
  const firstToolFrame = first((f) => f.type === 'TOOL_CALL_START') || first((f) => f.type === 'STEP_STARTED') || first((f) => f.type === 'CUSTOM' && f.name === 'ondemand.status' && /researching|planning/.test(f.valueParsed?.phase || '')) || first((f) => f.valueParsed?.pluginId || f.valueParsed?.plugin);
  const stripBody = strip(data.sseMeta.requestBody);
  Object.assign(metrics, {
    proxyPayload: stripBody,
    pluginIdsRequested: stripBody?.context?.pluginIds ?? stripBody?.pluginIds ?? null,
    responseStatus: data.sseMeta.responseStatus, responseHeaders: data.sseMeta.responseHeaders, headersAtMs: data.sseMeta.headersAt,
    sseFrameCount: data.sse.length,
    frameTypeCounts: data.sse.reduce((a, f) => { const k = f.type + (f.name ? ':' + f.name : ''); a[k] = (a[k] || 0) + 1; return a; }, {}),
    firstEventMs: data.sse[0]?.tMs ?? null,
    firstTokenMs: firstTok?.tMs ?? null,
    firstTokenPaintMs: fsn('.oiu-assistant p'),
    firstPendingRowMs: fsn('[data-testid=pending-row]'),
    firstPluginCardMs: fsn('[data-testid=plugin-activity]'),
    firstPluginSearchedMs: fsn('[data-testid=plugin-activity][data-state=searched]'),
    firstPluginFailedMs: fsn('[data-testid=plugin-activity][data-state=failed]'),
    firstThinkingTraceMs: fsn('[data-testid=thinking-trace]'),
    firstCitationChipMs: fsn('[data-testid=citation-chip]'),
    firstStepSummaryMs: fsn('[data-testid=step-summary]'),
    firstSourceLinkMs: fsn('[data-testid=source-link]'),
    firstAnswerBadgeMs: fsn('[data-testid=answer-badge]'),
    firstChatErrorMs: fsn('[data-testid=chat-error]'),
    streamEndMs: doneF?.tMs ?? null, streamEndFrameType: doneF?.type ?? null,
    frameToPaintLatencyMs: median([
      fsn('[data-testid=plugin-activity]') != null && firstToolFrame ? fsn('[data-testid=plugin-activity]') - firstToolFrame.tMs : null,
      fsn('.oiu-assistant p') != null && firstTok ? fsn('.oiu-assistant p') - firstTok.tMs : null,
    ]),
    frameToPaintParts: { toolCard: fsn('[data-testid=plugin-activity]') != null && firstToolFrame ? { frameType: firstToolFrame.type, frameMs: firstToolFrame.tMs, paintMs: fsn('[data-testid=plugin-activity]') } : null, firstToken: firstTok ? { frameMs: firstTok.tMs, paintMs: fsn('.oiu-assistant p') } : null },
    firstSeen: data.firstSeen,
  });
  const t0 = data.sendT0, tEnd = t0 + (metrics.streamEndMs ?? (Date.now() - wallT0));
  const ls = data.perf.layoutShifts.filter((e) => e.t >= t0 && e.t <= tEnd + 2000 && !e.hadRecentInput);
  metrics.cls = +ls.reduce((a, e) => a + e.value, 0).toFixed(4); metrics.layoutShiftCount = ls.length; metrics.layoutShiftsAll = data.perf.layoutShifts.length;
  const lt = data.perf.longTasks.filter((e) => e.t >= t0 - 1000);
  metrics.longTasks = { count: lt.length, maxMs: lt.length ? Math.max(...lt.map((e) => e.dur)) : 0, totalMs: +lt.reduce((a, e) => a + e.dur, 0).toFixed(1), allBeforeSend: data.perf.longTasks.length - lt.length };
  metrics.paints = data.perf.paints; metrics.slowEvents = { count: data.perf.events.length, maxDur: data.perf.events.length ? Math.max(...data.perf.events.map((e) => e.dur)) : 0 };
  const fr = data.raf.frames; const dropped = fr.filter((d) => d > 34).length;
  metrics.rafDroppedFrames = { sampled: fr.length, dropped, pct: fr.length ? +((dropped / fr.length) * 100).toFixed(2) : 0, maxDeltaMs: fr.length ? +Math.max(...fr).toFixed(1) : 0, p95DeltaMs: fr.length ? +[...fr].sort((a, b) => a - b)[Math.floor(fr.length * 0.95)].toFixed(1) : 0 };
  const sc = data.scroll; const grow = sc.filter((s, i) => i > 0 && s.scrollHeight > sc[i - 1].scrollHeight);
  metrics.scrollAnchoring = { samples: sc.length, atBottomPct: sc.length ? +((sc.filter((s) => s.atBottom).length / sc.length) * 100).toFixed(1) : null, atBottomWhileGrowingPct: grow.length ? +((grow.filter((s) => s.atBottom).length / grow.length) * 100).toFixed(1) : null, scroller: sc[0]?.scroller ?? null, maxScrollHeight: sc.length ? Math.max(...sc.map((s) => s.scrollHeight)) : null, userScrolled: false };
  const blanks = []; let cur = null;
  for (const s of sc) { const blank = !s.anyText && !s.pluginVisible && !s.pendingVisible && !s.errorVisible; if (blank && !cur) cur = { startMs: s.t }; if (!blank && cur) { cur.endMs = s.t; blanks.push(cur); cur = null; } }
  if (cur) { cur.endMs = sc[sc.length - 1]?.t ?? cur.startMs; blanks.push(cur); }
  metrics.blankIntervalsOver1500ms = blanks.filter((b) => b.endMs - b.startMs > 1500).map((b) => ({ startMs: +b.startMs.toFixed(0), endMs: +b.endMs.toFixed(0) }));
  metrics.pluginCard = { statesSeen: data.pluginStates.map((p) => p.state), finalState: data.pluginStates[data.pluginStates.length - 1]?.state ?? null, errorText: await page.locator('[data-testid=plugin-activity][data-state=failed], [data-testid=plugin-error-card]').first().textContent().catch(() => null), finalText: await page.locator('[data-testid=plugin-activity]').first().textContent().catch(() => null) };
  metrics.errorCode = await page.locator('[data-testid=chat-error]').first().getAttribute('data-error-code').catch(() => null);
  metrics.errorText = await page.locator('[data-testid=chat-error]').first().textContent().catch(() => null);
  metrics.sourcesCount = await page.locator('[data-testid=source-link]').count();
  metrics.citationChips = await page.locator('[data-testid=citation-chip]').count();
  metrics.stepSummaries = await page.locator('[data-testid=step-summary]').count();
  metrics.assistantMessages = await page.locator('[data-testid=assistant-message]').count();
  metrics.answerChars = await page.$$eval('.oiu-assistant__body', (els) => els.reduce((a, e) => a + (e.textContent || '').length, 0)).catch(() => 0);
  metrics.answerBadgeText = await page.locator('[data-testid=answer-badge]').first().textContent().catch(() => null);
  const sidM = data.sse.map((f) => f.raw).join('\n').match(/"sessionId"\s*:\s*"([^"]+)"|session[_-]?id[^a-z0-9]{0,5}([a-f0-9-]{16,})/i);
  metrics.sessionId = sidM ? (sidM[1] || sidM[2]) : (data.sseMeta.responseHeaders?.['x-ondemand-session'] ?? null);
  const errF = first((f) => f.name === 'ondemand.error' || /ondemand\.error/.test(f.raw) || f.type === 'RUN_ERROR');
  metrics.firstErrorFrame = errF ? { tMs: errF.tMs, raw: errF.raw.slice(0, 2000) } : null;

  // ---------- 4. GROWTH ----------
  metrics.growth = await runGrowth(page, false);
  try {
    const p2 = await context.newPage(); await p2.emulateMedia({ reducedMotion: 'reduce' });
    const g2 = await runGrowth(p2, true); metrics.growthReducedMotion = g2;
    metrics.growth.reducedMotionOk = !!(g2.expanded && g2.expandLatencyMs != null && g2.expandLatencyMs < 1500 && !g2.error);
    await p2.close();
  } catch (e) { metrics.growth.reducedMotionOk = false; metrics.growth.reducedMotionError = e.message; }
  await finish(0);
} catch (e) {
  metrics.fatalError = { message: e.message, stack: String(e.stack || '').slice(0, 1500) };
  log('FATAL', e.message);
  await finish(1);
}

async function runGrowth(pg, quick) {
  const g = { quick };
  try {
    await pg.goto(`${base}/onboarding`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await pg.waitForTimeout(600);
    if (!/\/onboarding/.test(pg.url()) || !(await pg.locator('[data-testid=growth-value]').count())) {
      await pg.evaluate(() => { let s = {}; try { s = JSON.parse(localStorage.getItem('bcap.settings.v1') || '{}'); } catch {} localStorage.setItem('bcap.settings.v1', JSON.stringify({ ...s, onboarded: false })); });
      await pg.goto(`${base}/onboarding`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    }
    await pg.waitForSelector('[data-testid=growth-value]', { timeout: 30_000 });
    g.url = pg.url(); g.tiles = await pg.locator('[data-testid=growth-value]').count();
    const btn = pg.locator('[data-testid=growth-value]').first();
    await btn.scrollIntoViewIfNeeded(); await pg.waitForTimeout(200);
    const box = await btn.boundingBox(); const tileBox = await btn.locator('.growth-tile').first().boundingBox();
    const target = tileBox || box;
    await pg.mouse.move(5, 5); await pg.waitForTimeout(300);
    const before = await pg.evaluate(() => getComputedStyle(document.querySelector('[data-testid=growth-value] .growth-tile')).backgroundColor);
    g.restingColor = before;
    // input-to-visual-change latency
    const t0 = await pg.evaluate(() => performance.now());
    await pg.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
    const lat = await pg.evaluate(async ({ before, t0 }) => {
      const el = document.querySelector('[data-testid=growth-value] .growth-tile');
      const start = performance.now();
      while (performance.now() - start < 1500) { if (getComputedStyle(el).backgroundColor !== before) return performance.now() - t0; await new Promise((r) => setTimeout(r, 8)); }
      return null;
    }, { before, t0 });
    g.hoverLatencyMs = lat == null ? null : +lat.toFixed(1);
    await pg.waitForTimeout(250);
    const cs = await pg.evaluate(() => { const el = document.querySelector('[data-testid=growth-value] .growth-tile'); const cs = getComputedStyle(el); return { bg: cs.backgroundColor, color: cs.color, transform: cs.transform, brandGreen: getComputedStyle(document.documentElement).getPropertyValue('--brand-green').trim(), primary: getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() }; });
    g.hoverColor = cs.bg; g.hoverTextColor = cs.color; g.hoverTransform = cs.transform; g.brandGreenVar = cs.brandGreen; g.primaryVar = cs.primary;
    g.isBrandGreen = /^rgba?\(\s*10,\s*201,\s*133/.test(cs.bg);
    g.hoverChanged = cs.bg !== before;
    if (!quick) await shot(pg, 'growth-hover.png');
    // expand latency
    const c0 = Date.now();
    if (viewportName === 'mobile' && !quick) await btn.tap().catch(() => btn.click()); else await btn.click();
    const exp = await pg.evaluate(async () => {
      const start = performance.now();
      while (performance.now() - start < 3000) {
        const b = document.querySelector('[data-testid=growth-value][aria-expanded="true"]');
        const p = document.querySelector('[data-testid=growth-panel][data-state=open]');
        if (b && p && p.getBoundingClientRect().height > 0) return performance.now() - start;
        await new Promise((r) => setTimeout(r, 8));
      }
      return null;
    });
    g.expandLatencyMs = exp == null ? null : +(exp + (Date.now() - c0 - (exp ?? 0)) * 0).toFixed(1);
    g.expandWallMs = Date.now() - c0;
    g.expanded = exp != null;
    g.expandedColor = await pg.evaluate(() => getComputedStyle(document.querySelector('[data-testid=growth-value][aria-expanded="true"] .growth-tile, [data-testid=growth-value] .growth-tile')).backgroundColor);
    g.panelText = await pg.locator('[data-testid=growth-panel][data-state=open]').first().textContent().then((t) => (t || '').trim().slice(0, 200)).catch(() => null);
    await pg.waitForTimeout(350);
    if (!quick) await shot(pg, 'growth-expanded.png');
  } catch (e) { g.error = e.message; }
  return g;
}
