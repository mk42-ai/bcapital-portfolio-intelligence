import { test as base, expect, type Page } from "@playwright/test";
import { primeSettings, captureErrors } from "./helpers";
import * as fs from "node:fs";
import * as path from "node:path";

// Two-turn chat timing at desktop + mobile (viewport switched explicitly; the "mobile" project only matches *mobile.spec.ts).
const PROOF = path.resolve(__dirname, "..", "proof");
fs.mkdirSync(PROOF, { recursive: true });
const OUT = path.join(PROOF, "qa-chat-timing.json");
const POLL_MS = 200;
const MAX_MS = 240_000;
const Q1 = "What is the latest news about Fervo Energy? Cite sources.";
const Q2 = "Summarise that in one sentence.";
const SUBMIT = "button.openui-agent-thread-composer__submit-button";

type Turn = {
  question: string;
  firstStatusMs: number | null;
  firstTokenMs: number | null;
  headersMs: number | null;
  totalMs: number;
  chunks: number;
  dataLines: number;
  frameTypes: string[];
  cardTransitions: string[];
  pendingPhases: string[];
  sources: number;
  sourcesTotalOnPage: number;
  errorCode: string | null;
  errorText: string | null;
  badgeText: string | null;
  badgeFirstTokenMs: string | null;
  pendingFirstStatusMs: string | null;
  sessionId: string | null;
  answerLength: number;
  answerExcerpt: string;
  submitLabelBefore: string | null;
  submitLabelDuringStream: string | null;
  submitLabelAfter: string | null;
  stopToSendOk: boolean;
  midstreamToolcardAtMs: number | null;
  streamDone: boolean;
  streamError: string | null;
};

function readOut(): Record<string, unknown> {
  try { return JSON.parse(fs.readFileSync(OUT, "utf8")); } catch { return {}; }
}

async function installWrapper(page: Page) {
  await page.addInitScript(() => {
    type Rec = { fetchAt: number; headersAt: number | null; done: boolean; error: string | null; chunks: { t: number; bytes: number; text: string }[] };
    const w = window as unknown as { __turns: Rec[] };
    w.__turns = [];
    const orig = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.includes("/api/chat")) return orig(input, init);
      const rec: Rec = { fetchAt: performance.now(), headersAt: null, done: false, error: null, chunks: [] };
      w.__turns.push(rec);
      const t0 = rec.fetchAt;
      const res = await orig(input, init);
      rec.headersAt = performance.now() - t0;
      if (res.body) {
        const reader = res.clone().body!.getReader();
        const dec = new TextDecoder();
        (async () => {
          try {
            for (;;) {
              const { value, done } = await reader.read();
              if (done) break;
              rec.chunks.push({ t: performance.now() - t0, bytes: value.byteLength, text: dec.decode(value, { stream: true }) });
            }
            rec.done = true;
          } catch (e) { rec.error = String(e); }
        })();
      }
      return res;
    };
  });
}

async function runTurn(page: Page, turnIdx: number, question: string, W: number, tag: string): Promise<Turn> {
  // The OpenUI shell renders two composers (desktop welcome + thread). Pick whichever has a layout box; on mobile after the
  // first turn the thread composer can sit in a 0-size container while still focusable, so fall back to focusing it directly.
  await page.waitForFunction(() => document.querySelectorAll("textarea").length > 0, null, { timeout: 20_000 });
  const picked = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll<HTMLTextAreaElement>("textarea"));
    const t = all.find((x) => x.offsetWidth > 0 && x.offsetHeight > 0) ?? all.find((x) => x.className.includes("thread-composer")) ?? all[all.length - 1];
    all.forEach((x) => x.removeAttribute("data-qa-pick"));
    t.setAttribute("data-qa-pick", "1");
    t.scrollIntoView({ block: "center" });
    t.focus();
    return { cls: t.className, boxed: t.offsetWidth > 0 };
  });
  const textarea = page.locator("textarea[data-qa-pick='1']");
  await expect(textarea).toBeAttached();
  const typeInto = async (q: string) => {
    if (picked.boxed) { await textarea.fill(q); return; }
    await textarea.evaluate((el) => (el as HTMLTextAreaElement).focus());
    await page.keyboard.insertText(q);
  };
  const submitLabelBefore = await page.locator(SUBMIT).getAttribute("aria-label").catch(() => null);
  const errBanner = page.locator('[data-testid="chat-error"]');
  const pluginSel = '[data-testid="plugin-activity"]';
  const cardTransitions: string[] = [];
  const pendingPhases: string[] = [];
  let midstreamToolcardAtMs: number | null = null;
  let submitLabelDuringStream: string | null = null;
  const assistantCountBefore = await page.locator(".oiu-assistant").count();
  const cardCountBefore = await page.locator(pluginSel).count();

  await typeInto(question);
  const t0 = Date.now();
  if (picked.boxed) await textarea.press("Enter"); else await page.keyboard.press("Enter");
  const shots = [500, 1000, 3000];
  let nextShot = 0;
  let sawStop = false;
  let answerLen = 0;

  while (Date.now() - t0 < MAX_MS) {
    const s = await page.evaluate(({ sel, before }) => {
      const a = document.querySelectorAll(".oiu-assistant");
      const last = a.length > before ? (a[a.length - 1] as HTMLElement) : null;
      const cards = Array.from(document.querySelectorAll<HTMLElement>(sel));
      const card = cards[cards.length - 1];
      const pend = document.querySelector<HTMLElement>('[data-testid="pending-row"]');
      return {
        len: last ? last.innerText.length : 0,
        cardState: card ? card.dataset.state ?? null : null,
        cardCount: cards.length,
        phase: pend ? pend.dataset.phase ?? null : null,
        label: document.querySelector("button.openui-agent-thread-composer__submit-button")?.getAttribute("aria-label") ?? null,
      };
    }, { sel: pluginSel, before: assistantCountBefore });
    const t = Date.now() - t0;
    if (s.cardCount > cardCountBefore && s.cardState && cardTransitions[cardTransitions.length - 1] !== s.cardState) cardTransitions.push(s.cardState);
    if (s.phase && pendingPhases[pendingPhases.length - 1] !== s.phase) pendingPhases.push(s.phase);
    if (midstreamToolcardAtMs === null && s.cardCount > cardCountBefore) {
      midstreamToolcardAtMs = t;
      await page.screenshot({ path: path.join(PROOF, `chat-${tag}-midstream-toolcard-${W}.png`), fullPage: false }).catch(() => {});
    }
    if (s.label === "Cancel message") { sawStop = true; submitLabelDuringStream = s.label; }
    answerLen = s.len;
    if (nextShot < shots.length && t >= shots[nextShot]) {
      const label = shots[nextShot] === 500 ? "0.5s" : shots[nextShot] === 1000 ? "1s" : "3s";
      await page.screenshot({ path: path.join(PROOF, `chat-${tag}-t${label}-${W}.png`), fullPage: false }).catch(() => {});
      nextShot++;
    }
    if (t > 2000 && s.label === "Send message" && (sawStop || answerLen > 0)) break;
    await page.waitForTimeout(POLL_MS);
  }
  const totalMs = Date.now() - t0;
  // settle
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(PROOF, `chat-${tag}-final-${W}.png`), fullPage: true }).catch(() => {});
  const submitLabelAfter = await page.locator(SUBMIT).getAttribute("aria-label").catch(() => null);

  const net = await page.evaluate((idx) => {
    const w = window as unknown as { __turns: { fetchAt: number; headersAt: number | null; done: boolean; error: string | null; chunks: { t: number; bytes: number; text: string }[] }[] };
    const rec = w.__turns[idx];
    if (!rec) return null;
    const text = rec.chunks.map((c) => c.text).join("");
    const firstWith = (needle: string) => { const c = rec.chunks.find((x) => x.text.includes(needle)); return c ? Math.round(c.t) : null; };
    return {
      headersAt: rec.headersAt, done: rec.done, error: rec.error, chunks: rec.chunks.length,
      dataLines: (text.match(/^data:/gm) ?? []).length,
      firstStatus: firstWith("ondemand.status"), firstToken: firstWith("TEXT_MESSAGE_CONTENT"),
      frameTypes: Array.from(new Set([...text.matchAll(/"type":"([A-Z_]+)"/g)].map((m) => m[1]))),
      sessionId: (text.match(/"sessionId":"([A-Za-z0-9]+)"/) ?? [])[1] ?? null,
    };
  }, turnIdx - 1);

  const dom = await page.evaluate(() => {
    const a = document.querySelectorAll<HTMLElement>(".oiu-assistant");
    const last = a[a.length - 1];
    const badge = (last?.querySelector<HTMLElement>('[data-testid="answer-badge"]')) ?? Array.from(document.querySelectorAll<HTMLElement>('[data-testid="answer-badge"]')).pop() ?? null;
    const err = (last?.querySelector<HTMLElement>('[data-testid="chat-error"]')) ?? Array.from(document.querySelectorAll<HTMLElement>('[data-testid="chat-error"]')).pop() ?? null;
    const pend = document.querySelector<HTMLElement>('[data-testid="pending-row"]');
    return {
      badgeText: badge?.innerText ?? null, badgeFirstTokenMs: badge?.dataset.firstTokenMs ?? null,
      errorCode: err?.dataset.errorCode ?? null, errorText: err?.innerText.slice(0, 200) ?? null,
      sources: last ? last.querySelectorAll('[data-testid="source-link"]').length : 0,
      sourcesTotalOnPage: document.querySelectorAll('[data-testid="source-link"]').length,
      pendingFirstStatusMs: pend?.dataset.firstStatusMs ?? null,
      answerText: last?.innerText ?? "",
    };
  });

  await page.screenshot({ path: path.join(PROOF, `chat-${tag}-final-sources-badge-${W}.png`), fullPage: false }).catch(() => {});
  if (await errBanner.count()) {
    await errBanner.last().scrollIntoViewIfNeeded().catch(() => {});
    await page.screenshot({ path: path.join(PROOF, `chat-${tag}-error-card-${W}.png`), fullPage: false }).catch(() => {});
  }

  return {
    question, firstStatusMs: net?.firstStatus ?? null, firstTokenMs: net?.firstToken ?? null, headersMs: net?.headersAt ?? null, totalMs,
    chunks: net?.chunks ?? 0, dataLines: net?.dataLines ?? 0, frameTypes: net?.frameTypes ?? [],
    cardTransitions, pendingPhases, sources: dom.sources, sourcesTotalOnPage: dom.sourcesTotalOnPage, errorCode: dom.errorCode, errorText: dom.errorText,
    badgeText: dom.badgeText, badgeFirstTokenMs: dom.badgeFirstTokenMs, pendingFirstStatusMs: dom.pendingFirstStatusMs,
    sessionId: net?.sessionId ?? null, answerLength: dom.answerText.length, answerExcerpt: dom.answerText.slice(0, 200),
    submitLabelBefore, submitLabelDuringStream, submitLabelAfter,
    stopToSendOk: sawStop && submitLabelAfter === "Send message",
    midstreamToolcardAtMs, streamDone: net?.done ?? false, streamError: net?.error ?? null,
  };
}

for (const vp of [{ name: "desktop", width: 1440, height: 900 }, { name: "mobile", width: 390, height: 844 }]) {
  base.describe(`QA chat timing @ ${vp.name}`, () => {
    base.use({ viewport: { width: vp.width, height: vp.height } });
    base("two turns in one thread: timings, tool card, session reuse", async ({ page }) => {
      base.setTimeout(2 * MAX_MS + 60_000);
      await primeSettings(page);
      const errors = captureErrors(page);
      await installWrapper(page);
      await page.goto("/chat?skip=1");
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

      const turn1 = await runTurn(page, 1, Q1, vp.width, "turn1");
      // legacy filename aliases requested by the task
      for (const [from, to] of [[`chat-turn1-midstream-toolcard-${vp.width}.png`, `chat-midstream-toolcard-${vp.width}.png`], [`chat-turn1-final-sources-badge-${vp.width}.png`, `chat-final-sources-badge-${vp.width}.png`], [`chat-turn1-error-card-${vp.width}.png`, `chat-error-card-${vp.width}.png`]]) {
        const f = path.join(PROOF, from); if (fs.existsSync(f)) fs.copyFileSync(f, path.join(PROOF, to));
      }
      const turn2 = await runTurn(page, 2, Q2, vp.width, "turn2");
      const sessionReused = !!turn1.sessionId && turn1.sessionId === turn2.sessionId;

      const out = readOut();
      out[vp.name] = { turn1, turn2, sessionReused, pageErrors: errors, generatedAt: new Date().toISOString() };
      fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
      console.log(`[qa-chat ${vp.name}] ` + JSON.stringify({ t1: { fs: turn1.firstStatusMs, ft: turn1.firstTokenMs, chunks: turn1.chunks, card: turn1.cardTransitions, src: turn1.sources, err: turn1.errorCode, sid: turn1.sessionId }, t2: { fs: turn2.firstStatusMs, ft: turn2.firstTokenMs, chunks: turn2.chunks, card: turn2.cardTransitions, src: turn2.sources, err: turn2.errorCode, sid: turn2.sessionId }, sessionReused }));

      for (const [name, t] of [["turn1", turn1], ["turn2", turn2]] as const) {
        expect(t.firstStatusMs, `${name} first-status ms recorded`).not.toBeNull();
        expect(t.firstStatusMs!, `${name} first-status ms < 1500 (actual ${t.firstStatusMs})`).toBeLessThan(1500);
        expect(t.cardTransitions.length, `${name} tool-card transitions non-empty`).toBeGreaterThan(0);
        expect(["searched", "failed"], `${name} card ends in searched|failed (got ${t.cardTransitions.join("→")})`).toContain(t.cardTransitions[t.cardTransitions.length - 1]);
        if (t.errorCode === null && t.cardTransitions[t.cardTransitions.length - 1] !== "failed") expect(t.answerLength, `${name} answer text length > 0`).toBeGreaterThan(0); // a plugin failure legitimately ends with the red card and no prose
        expect(t.stopToSendOk, `${name} Stop → Send (during=${t.submitLabelDuringStream}, after=${t.submitLabelAfter})`).toBe(true);
      }
      expect(sessionReused, `sessionId reused on turn 2 (${turn1.sessionId} vs ${turn2.sessionId})`).toBe(true);
      expect(errors.filter((e) => e.startsWith("pageerror")), "0 page errors").toEqual([]);
    });
  });
}
