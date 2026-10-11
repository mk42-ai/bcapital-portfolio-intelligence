/**
 * a3 — Working header single-source-of-truth invariant.
 *
 * The run panel must have exactly ONE "Working…" surface: the anchored `run-status-header` at the top of the run panel
 * (falls back to `thinking-block` on builds that pre-date the header — annotated "header not in baseline").
 * Across one full live run we sample the DOM every 400 ms (≤150 s) and assert:
 *   (a) the header's offsetTop relative to `run-view` never moves by more than 2 px once it first appears;
 *   (b) at NO sample is there an element whose visible text starts with "Working" sitting BELOW a `working-row` and
 *       ABOVE `outputs-card` / `answer-block` (an interleaved Working band);
 *   (c) `working-band` never exists in the DOM;
 *   (d) after the answer, the header (or thinking-block) is still the first run-view child after `run-header`.
 * Samples → web/proof/pass-3/working-header-samples.ndjson. Run with --workers=1, one project.
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { primeSettings } from "./helpers";

const QUESTION = "Which of my context companies moved most since the last sentiment run, and why?";
const POLL_MS = 400;
const MAX_MS = 150_000;
const PROOF_DIR = path.resolve(__dirname, "../proof/pass-3");
const OUT = path.join(PROOF_DIR, "working-header-samples.ndjson");

type Sample = {
  vp: string; t: number; anchor: "run-status-header" | "thinking-block" | null; anchorTop: number | null; anchorIdx: number | null;
  runHeaderIdx: number | null; workingRows: number; workingBand: number; outputsTop: number | null; answerTop: number | null;
  lastWorkingRowBottom: number | null; interleaved: { text: string; top: number; testid: string | null }[]; answerChars: number; live: string | null;
};

async function sample(page: Page, vp: string, t: number): Promise<Sample> {
  return page.evaluate(({ vp, t }) => {
    const views = Array.from(document.querySelectorAll<HTMLElement>("[data-testid=run-view]"));
    const rv = views[views.length - 1] ?? null;
    const rel = (el: HTMLElement | null) => (el && rv ? el.getBoundingClientRect().top - rv.getBoundingClientRect().top : null);
    const header = rv?.querySelector<HTMLElement>("[data-testid=run-status-header]") ?? null;
    const think = rv?.querySelector<HTMLElement>("[data-testid=thinking-block]") ?? null;
    const anchorEl = header ?? think;
    const kids = rv ? Array.from(rv.children) : [];
    const idxOf = (el: Element | null) => { if (!el) return null; let n: Element | null = el; while (n && n.parentElement !== rv) n = n.parentElement; return n ? kids.indexOf(n) : null; };
    const rows = rv ? Array.from(rv.querySelectorAll<HTMLElement>("[data-testid=working-row]")) : [];
    const lastRowBottom = rows.length && rv ? Math.max(...rows.map((r) => r.getBoundingClientRect().bottom - rv!.getBoundingClientRect().top)) : null;
    const outputs = rv?.querySelector<HTMLElement>("[data-testid=outputs-card]") ?? null;
    const answer = rv?.querySelector<HTMLElement>("[data-testid=answer-block]") ?? null;
    const lower = [rel(outputs), rel(answer)].filter((x): x is number => x != null);
    const lowerTop = lower.length ? Math.min(...lower) : Number.POSITIVE_INFINITY;
    const interleaved: { text: string; top: number; testid: string | null }[] = [];
    if (rv && lastRowBottom != null) {
      for (const el of Array.from(rv.querySelectorAll<HTMLElement>("*"))) {
        if (el.closest("[data-testid=working-row]") || el.closest("[data-testid=run-status-header]")) continue;
        const own = Array.from(el.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent ?? "").join("").trim();
        if (!/^Working\b/.test(own)) continue;
        const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
        const top = r.top - rv.getBoundingClientRect().top;
        if (top >= lastRowBottom - 1 && top < lowerTop) interleaved.push({ text: own.slice(0, 40), top: Math.round(top), testid: el.closest("[data-testid]")?.getAttribute("data-testid") ?? null });
      }
    }
    return {
      vp, t, anchor: header ? "run-status-header" : think ? "thinking-block" : null, anchorTop: rel(anchorEl) == null ? null : Math.round(rel(anchorEl)! * 10) / 10,
      anchorIdx: idxOf(anchorEl), runHeaderIdx: idxOf(rv?.querySelector("[data-testid=run-header]") ?? null), workingRows: rows.length,
      workingBand: document.querySelectorAll("[data-testid=working-band]").length, outputsTop: rel(outputs), answerTop: rel(answer), lastWorkingRowBottom: lastRowBottom,
      interleaved, answerChars: answer?.textContent?.length ?? 0, live: rv?.getAttribute("data-live") ?? null,
    } as Sample;
  }, { vp, t });
}

async function send(page: Page, q: string) {
  await page.waitForFunction(() => document.querySelectorAll("textarea").length > 0, null, { timeout: 20_000 });
  await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll<HTMLTextAreaElement>("textarea"));
    const t = all.find((x) => x.offsetWidth > 0 && x.offsetHeight > 0) ?? all[all.length - 1];
    all.forEach((x) => x.removeAttribute("data-a3-pick")); t.setAttribute("data-a3-pick", "1"); t.focus();
  });
  const ta = page.locator("textarea[data-a3-pick='1']");
  await ta.fill(q);
  await ta.press("Enter");
}

for (const vp of [{ name: "desktop", width: 1440, height: 900 }, { name: "mobile", width: 390, height: 844 }]) {
  test.describe.serial(`run panel Working header invariant @ ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });
    test(`one source of truth for "Working…" across a live ≥2-tool run (${vp.name})`, async ({ page }, testInfo) => {
      test.setTimeout(MAX_MS + 60_000);
      await primeSettings(page);
      fs.mkdirSync(PROOF_DIR, { recursive: true });
      await page.goto("/chat?skip=1");
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      await send(page, QUESTION);
      const t0 = Date.now();
      const samples: Sample[] = [];
      let firstTop: number | null = null; let maxDrift = 0; let interleavedHits = 0; let bandHits = 0; let maxRows = 0;
      let idleSince = 0;
      while (Date.now() - t0 < MAX_MS) {
        const s = await sample(page, vp.name, Date.now() - t0).catch(() => null);
        if (s) {
          samples.push(s);
          if (s.anchorTop != null) { if (firstTop == null) firstTop = s.anchorTop; maxDrift = Math.max(maxDrift, Math.abs(s.anchorTop - firstTop)); }
          if (s.interleaved.length) interleavedHits += 1;
          if (s.workingBand > 0) bandHits += 1;
          maxRows = Math.max(maxRows, s.workingRows);
          // stop once the run has settled (not live, answer present) and stayed settled for ~2 s
          if (s.live === "false" && s.answerChars > 0) { if (!idleSince) idleSince = Date.now(); else if (Date.now() - idleSince > 2_000) break; } else idleSince = 0;
        }
        await page.waitForTimeout(POLL_MS);
      }
      const final = samples[samples.length - 1];
      const anchorKinds = [...new Set(samples.map((s) => s.anchor).filter(Boolean))];
      const headerInBaseline = anchorKinds.includes("run-status-header");
      const note = headerInBaseline ? "run-status-header present" : "header not in baseline (fell back to thinking-block)";
      fs.appendFileSync(OUT, samples.map((s) => JSON.stringify(s)).join("\n") + "\n");
      const summary = { vp: vp.name, baseURL: testInfo.project.use.baseURL, note, samples: samples.length, durationMs: Date.now() - t0, firstTop, maxDrift, interleavedHits, bandHits, maxWorkingRows: maxRows, finalLive: final?.live, finalAnswerChars: final?.answerChars, finalAnchorIdx: final?.anchorIdx, finalRunHeaderIdx: final?.runHeaderIdx };
      fs.appendFileSync(OUT, JSON.stringify({ summary }) + "\n");
      testInfo.annotations.push({ type: "working-header", description: JSON.stringify(summary) });
      console.log(`[a3 ${vp.name}] ${JSON.stringify(summary)}`);
      if (!headerInBaseline) testInfo.annotations.push({ type: "note", description: "header not in baseline" });

      expect(samples.length, "sampled the run").toBeGreaterThan(5);
      expect(maxRows, "≥2 tool rows (Perplexity + Portfolio Plugin)").toBeGreaterThanOrEqual(2);
      expect(final?.answerChars ?? 0, "answer rendered").toBeGreaterThan(0);
      // (a) anchored header never moves
      expect(firstTop, "anchor appeared").not.toBeNull();
      expect(maxDrift, `(a) anchor top drift ≤2px (actual ${maxDrift}px, ${note})`).toBeLessThanOrEqual(2);
      // (b) no interleaved "Working…" row between working rows and outputs/answer
      const firstHit = samples.find((s) => s.interleaved.length);
      expect(interleavedHits, `(b) interleaved Working row at ${interleavedHits} samples; first: ${JSON.stringify(firstHit?.interleaved ?? null)} @ ${firstHit?.t ?? "-"} ms`).toBe(0);
      // (c) working-band never exists
      expect(bandHits, `(c) working-band present at ${bandHits} samples`).toBe(0);
      // (d) after the answer, the anchor is still the first child after run-header
      expect(final?.runHeaderIdx, "(d) run-header present after the answer").not.toBeNull();
      expect(final?.anchorIdx, `(d) anchor idx ${final?.anchorIdx} is run-header idx ${final?.runHeaderIdx} + 1`).toBe((final?.runHeaderIdx ?? -2) + 1);
    });
  });
}
