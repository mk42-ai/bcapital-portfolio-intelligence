import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { primeSettings } from "./helpers";
import { qaCheck, BLUE_SWEEP, RESULTS_DIR } from "./qa-owner-helpers";

/** Owner QA — Agent A: check 1 (layout / rail / inspector / blue sweep / composer row) + check 6 (images + last company row). */
const AGENT = "A";
const VIEWPORTS = [
  { w: 1440, h: 900 },
  { w: 390, h: 844 },
];
const NAV_MS = 60_000;

// Rows must be independent (a failing row must not skip the rest) → default mode; run with --workers=1 for ordering.
test.describe.configure({ mode: "default" });

async function gotoChat(page: Page) {
  await page.goto("/chat?skip=1", { waitUntil: "domcontentloaded", timeout: NAV_MS });
  await page.locator("[data-testid=chat-shell]").waitFor({ state: "visible", timeout: NAV_MS });
  await page.locator("[data-testid=composer-row]").waitFor({ state: "visible", timeout: NAV_MS });
  await page.waitForTimeout(1000);
}

async function gotoSettled(page: Page, route: string) {
  await page.goto(route, { waitUntil: "domcontentloaded", timeout: NAV_MS });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(800);
}

async function openInspector(page: Page) {
  const drawer = page.locator("[data-testid=chat-inspector]");
  if ((await drawer.getAttribute("data-open")) !== "true") {
    await page.locator("[data-testid=inspector-toggle]").filter({ visible: true }).first().click({ timeout: 15_000 });
  }
  await expect(drawer).toHaveAttribute("data-open", "true", { timeout: 15_000 });
  await page.waitForTimeout(500);
}

for (const vp of VIEWPORTS) {
  const vpTag = `${vp.w}x${vp.h}`;
  const isDesktop = vp.w >= 1024;

  test.describe(`Owner QA A @ ${vpTag}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await primeSettings(page);
    });

    // ───────────────────────── CHECK 1 ─────────────────────────
    test(`1a-single-thread-container ${vpTag}`, async ({ page }, testInfo) => {
      await gotoChat(page);
      await qaCheck(AGENT, page, testInfo, "1a-single-thread-container", async () => {
        const counts = await page.evaluate(() => ({
          canvas: document.querySelectorAll("[data-testid=chat-canvas]").length,
          shell: document.querySelectorAll("[data-testid=chat-shell]").length,
          containers: document.querySelectorAll(".openui-agent-thread-container").length,
          messages: document.querySelectorAll(".openui-agent-thread-messages").length,
          sidebars: [...document.querySelectorAll(".openui-agent-sidebar-container")].map((el) => getComputedStyle(el).display),
        }));
        expect(counts.canvas, "chat-canvas count").toBe(1);
        expect(counts.shell, "chat-shell count").toBe(1);
        expect(counts.containers, ".openui-agent-thread-container count").toBe(1);
        expect(counts.messages, ".openui-agent-thread-messages count (≤1)").toBeLessThanOrEqual(1);
        for (const d of counts.sidebars) expect(d, "openui sidebar must be display:none").toBe("none");
        if (!isDesktop) {
          // no second thread column on mobile: the thread container must span (nearly) the full viewport width
          const box = await page.locator(".openui-agent-thread-container").boundingBox();
          expect(box, "thread container box").not.toBeNull();
          expect(box!.width, "thread container width on mobile").toBeGreaterThanOrEqual(vp.w * 0.85);
        }
        return `containers=${counts.containers} messages=${counts.messages} sidebars=${JSON.stringify(counts.sidebars)}`;
      });
    });

    test(`1b-rail-collapse-width ${vpTag}`, async ({ page }, testInfo) => {
      await gotoChat(page);
      await qaCheck(AGENT, page, testInfo, "1b-rail-collapse-width", async () => {
        const rail = page.locator("[data-testid=nav-rail]");
        await expect(rail).toBeVisible({ timeout: 15_000 });
        const links = await page.locator("[data-testid=nav-rail] a[data-testid^=nav-]").count();
        if (isDesktop) {
          const toggle = page.locator("[data-testid=nav-toggle]");
          await expect(toggle).toBeVisible({ timeout: 15_000 });
          const initial = await rail.getAttribute("data-collapsed");
          const w0 = (await rail.boundingBox())!.width;
          expect(initial, "rail starts collapsed on /chat").toBe("true");
          expect(w0, "collapsed width at start").toBeLessThanOrEqual(64);
          await toggle.click();
          await expect(rail).toHaveAttribute("data-collapsed", "false", { timeout: 10_000 });
          await page.waitForTimeout(600);
          const wExp = (await rail.boundingBox())!.width;
          expect(wExp, "expanded width ≤224").toBeLessThanOrEqual(224);
          expect(wExp, "expanded wider than collapsed").toBeGreaterThan(w0);
          await toggle.click();
          await expect(rail).toHaveAttribute("data-collapsed", "true", { timeout: 10_000 });
          await page.waitForTimeout(600);
          const wCol = (await rail.boundingBox())!.width;
          expect(wCol, "collapsed width ≤64").toBeLessThanOrEqual(64);
          const linksAfter = await page.locator("[data-testid=nav-rail] a[data-testid^=nav-]").count();
          expect(linksAfter, "5 nav anchors present when collapsed").toBe(5);
          return `start=${w0}px expanded=${wExp}px collapsed=${wCol}px links=${links}/${linksAfter}`;
        }
        const box = (await rail.boundingBox())!;
        expect(box.height, "mobile rail height ≤64").toBeLessThanOrEqual(64);
        expect(links, "nav anchors present").toBeGreaterThanOrEqual(1);
        return `mobile rail ${box.width}x${box.height}px links=${links}`;
      });
    });

    test(`1c-inspector-drawer ${vpTag}`, async ({ page }, testInfo) => {
      await gotoChat(page);
      await qaCheck(AGENT, page, testInfo, "1c-inspector-drawer", async () => {
        const allToggles = page.locator("[data-testid=inspector-toggle]");
        const toggle = allToggles.filter({ visible: true });
        const drawer = page.locator("[data-testid=chat-inspector]");
        await expect(toggle, "exactly one VISIBLE inspector-toggle").toHaveCount(1, { timeout: 15_000 });
        const toggleTotal = await allToggles.count();
        await expect(drawer).toHaveAttribute("data-open", "false");
        await toggle.click();
        await expect(drawer).toHaveAttribute("data-open", "true", { timeout: 10_000 });
        await expect(toggle).toHaveAttribute("aria-expanded", "true");
        expect(await drawer.evaluate((el) => (el as HTMLElement).inert), "drawer not inert while open").toBe(false);
        const facts = page.locator("[data-testid=pb-facts]");
        const railLoc = page.locator("[data-testid=run-rail]");
        const factsVis = await facts.isVisible().catch(() => false);
        const railVis = await railLoc.isVisible().catch(() => false);
        expect(factsVis || railVis, "pb-facts or run-rail visible when open").toBe(true);
        await page.keyboard.press("Escape");
        let closed = await drawer.getAttribute("data-open");
        let how = "Escape";
        if (closed !== "false") {
          await page.locator("[data-testid=inspector-close]").click({ timeout: 10_000 });
          how = "inspector-close";
        }
        await expect(drawer).toHaveAttribute("data-open", "false", { timeout: 10_000 });
        await expect(toggle).toHaveAttribute("aria-expanded", "false");
        closed = await drawer.getAttribute("data-open");
        return `toggles in DOM=${toggleTotal} (visible=1); opened via toggle (pb-facts=${factsVis}, run-rail=${railVis}); closed via ${how} → data-open=${closed}`;
      });
    });

    test(`1d-telemetry-single-reveal ${vpTag}`, async ({ page }, testInfo) => {
      await gotoChat(page);
      await qaCheck(AGENT, page, testInfo, "1d-telemetry-single-reveal", async () => {
        await openInspector(page);
        const disclosures = page.locator("[data-testid=run-rail] details[data-testid=dev-disclosure]");
        const allDisclosures = await page.locator("details[data-testid=dev-disclosure]").count();
        expect(allDisclosures, "exactly one dev-disclosure on the page").toBe(1);
        await expect(disclosures).toHaveCount(1);
        const summary = disclosures.locator("summary");
        await expect(summary).toContainText(/Telemetry & raw SSE frame/i);
        const body = page.locator("pre[data-testid=request-body]");
        const metrics = page.locator("[data-testid=rail-metrics]");
        expect(await body.isVisible(), "request-body hidden before open").toBe(false);
        expect(await metrics.isVisible(), "rail-metrics hidden before open").toBe(false);
        await summary.click();
        await expect(disclosures).toHaveAttribute("open", "");
        await expect(body).toBeVisible({ timeout: 10_000 });
        await expect(metrics).toBeVisible({ timeout: 10_000 });
        const strayRawFrame = await page.evaluate(() => {
          const details = document.querySelector("details[data-testid=dev-disclosure]");
          const out: string[] = [];
          for (const el of document.querySelectorAll("body *")) {
            if (details && details.contains(el)) continue;
            if (el.children.length > 0) continue; // leaf text holders only
            if (/show raw frame/i.test(el.textContent || "")) out.push(`${el.tagName}.${String(el.className).slice(0, 40)}: ${(el.textContent || "").trim().slice(0, 60)}`);
          }
          return out;
        });
        expect(strayRawFrame, `no other "show raw frame" control outside the details: ${JSON.stringify(strayRawFrame)}`).toEqual([]);
        return `dev-disclosure=1; request-body & rail-metrics hidden→visible after summary click; stray raw-frame=0`;
      });
    });

    test(`1e-no-blue-hue ${vpTag}`, async ({ page }, testInfo) => {
      await gotoChat(page);
      await qaCheck(AGENT, page, testInfo, "1e-no-blue-hue", async () => {
        const results: Record<string, string[]> = {};
        results["/chat?skip=1"] = (await page.evaluate(BLUE_SWEEP)) as string[];
        await openInspector(page);
        results["/chat?skip=1 +drawer"] = (await page.evaluate(BLUE_SWEEP)) as string[];
        for (const route of ["/overview", "/company/apptronik"]) {
          await gotoSettled(page, route);
          results[route] = (await page.evaluate(BLUE_SWEEP)) as string[];
        }
        const offenders = Object.entries(results).filter(([, v]) => v.length > 0);
        expect(offenders, `blue-hue offenders: ${JSON.stringify(offenders).slice(0, 1500)}`).toEqual([]);
        return `swept ${Object.keys(results).join(", ")} → 0 offenders each`;
      });
    });

    test(`1f-composer-row-siblings ${vpTag}`, async ({ page }, testInfo) => {
      await gotoChat(page);
      await qaCheck(AGENT, page, testInfo, "1f-composer-row-siblings", async () => {
        const info = await page.evaluate(() => {
          const row = document.querySelector("[data-testid=composer-row]") as HTMLElement | null;
          if (!row) return null;
          const kids = [...row.children].map((c) => `${c.tagName.toLowerCase()}[${c.getAttribute("data-testid")}]`);
          const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
          const attach = q("button[data-testid=attachment-button]");
          const ta = q("textarea[data-testid=composer-input]");
          const micSlot = q("span[data-testid=composer-mic-slot]");
          const mic = q("button[data-testid=voice-mic]");
          const send = q("button[data-testid=composer-send]");
          const fileInput = q("input[type=file][data-testid=attachment-input]");
          const rect = (el: HTMLElement | null) => (el ? el.getBoundingClientRect().toJSON() : null);
          const composer = q("[data-testid=composer]");
          return {
            display: getComputedStyle(row).display,
            kids,
            sameRow: [attach, ta, micSlot, send].every((el) => el && el.parentElement === row),
            micInsideSlot: !!(mic && micSlot && micSlot.contains(mic)),
            // "hidden" = not visually rendered: display:none, visibility:hidden, opacity:0 or a ≤1px visually-hidden box (a11y pattern)
            fileHidden:
              !!fileInput &&
              (getComputedStyle(fileInput).display === "none" ||
                getComputedStyle(fileInput).visibility === "hidden" ||
                parseFloat(getComputedStyle(fileInput).opacity) === 0 ||
                fileInput.getBoundingClientRect().width <= 1),
            fileStyle: fileInput ? `${getComputedStyle(fileInput).display}/${getComputedStyle(fileInput).opacity}/${fileInput.getBoundingClientRect().width}px` : "missing",
            attachText: attach?.textContent?.trim() || attach?.getAttribute("aria-label") || "",
            rects: { attach: rect(attach), ta: rect(ta), mic: rect(mic), send: rect(send), composer: rect(composer) },
            vh: window.innerHeight,
          };
        });
        expect(info, "composer-row exists").not.toBeNull();
        const i = info!;
        expect(i.display, "composer-row display flex").toBe("flex");
        expect(i.kids.join(" > ")).toBe(
          "input[attachment-input] > button[attachment-button] > textarea[composer-input] > span[composer-mic-slot] > button[composer-send]",
        );
        expect(i.sameRow, "attach/textarea/mic-slot/send are direct children of the same row").toBe(true);
        expect(i.micInsideSlot, "voice-mic inside composer-mic-slot").toBe(true);
        expect(i.fileHidden, "file input hidden").toBe(true);
        expect(i.attachText, "attach button labelled Attach").toMatch(/attach/i);
        const tops = [i.rects.attach, i.rects.ta, i.rects.mic, i.rects.send].map((r) => r!.top);
        const spread = Math.max(...tops) - Math.min(...tops);
        expect(spread, `tops within 20px (tops=${tops.map((t) => t.toFixed(0)).join(",")})`).toBeLessThanOrEqual(20);
        const gap = i.vh - i.rects.composer!.bottom;
        expect(gap, `composer bottom within 80px of viewport bottom (gap=${gap.toFixed(0)})`).toBeLessThanOrEqual(80);
        expect(gap, "composer not below the viewport").toBeGreaterThanOrEqual(-1);
        return `kids=${i.kids.join(">")} fileInput=${i.fileStyle} topSpread=${spread.toFixed(1)}px bottomGap=${gap.toFixed(1)}px`;
      });
    });

    // ───────────────────────── CHECK 6 ─────────────────────────
    test(`6a-broken-images ${vpTag}`, async ({ page }, testInfo) => {
      await qaCheck(AGENT, page, testInfo, "6a-broken-images", async () => {
        const perRoute: Record<string, { broken: number; total: number; samples: string[] }> = {};
        for (const route of ["/overview", "/news", "/companies"]) {
          await gotoSettled(page, route);
          for (let s = 1; s <= 4; s++) {
            await page.evaluate((f) => window.scrollTo(0, (document.body.scrollHeight * f) / 4), s);
            await page.waitForTimeout(400);
          }
          await page.waitForTimeout(3000);
          perRoute[route] = await page.evaluate(() => {
            const imgs = [...document.images];
            const broken = imgs.filter((i) => i.complete && i.naturalWidth === 0 && !i.hidden && i.getBoundingClientRect().width > 0);
            return { broken: broken.length, total: imgs.length, samples: broken.slice(0, 5).map((i) => i.currentSrc || i.src) };
          });
          await page.evaluate(() => window.scrollTo(0, 0));
        }
        const bad = Object.entries(perRoute).filter(([, v]) => v.broken > 0);
        expect(bad, `broken images: ${JSON.stringify(bad)}`).toEqual([]);
        return Object.entries(perRoute)
          .map(([r, v]) => `${r}: ${v.broken}/${v.total} broken`)
          .join("; ");
      });
    });

    test(`6b-last-company-row ${vpTag}`, async ({ page }, testInfo) => {
      await gotoSettled(page, "/companies");
      await qaCheck(AGENT, page, testInfo, "6b-last-company-row", async () => {
        const list = page.locator("[data-testid=companies-list]");
        await expect(list).toBeVisible({ timeout: 30_000 });
        const totalAttr = await list.getAttribute("data-total");
        const n = Number(totalAttr);
        expect(n, `data-total numeric (${totalAttr})`).toBeGreaterThan(0);
        const last = page.locator(`[data-testid=company-row][data-index="${n - 1}"]`);
        let loops = 0;
        for (; loops < 40; loops++) {
          if ((await last.count()) > 0) break;
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await page.waitForTimeout(150);
        }
        expect(await last.count(), `row data-index=${n - 1} rendered after ${loops} scrolls`).toBeGreaterThan(0);
        await last.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        await expect(last).toBeVisible();
        // Read geometry in-page (the virtualiser re-mounts rows while scrolling; a handle-based boundingBox can race it).
        const geo = await page.evaluate((idx) => {
          const r = document.querySelector(`[data-testid=company-row][data-index="${idx}"]`) as HTMLElement | null;
          if (!r) return null;
          const b = r.getBoundingClientRect();
          return { top: b.top, bottom: b.bottom, height: b.height, width: b.width, vh: window.innerHeight, scrollY: window.scrollY, docH: document.documentElement.scrollHeight, rendered: document.querySelectorAll("[data-testid=company-row]").length, last: r.getAttribute("data-last"), text: (r.innerText || "").replace(/\s+/g, " ").trim().slice(0, 60) };
        }, n - 1);
        expect(geo, "last row still mounted").not.toBeNull();
        expect(geo!.height, "last row has height").toBeGreaterThan(0);
        expect(geo!.top, "last row top within viewport").toBeGreaterThanOrEqual(0);
        expect(geo!.bottom, "last row bottom within viewport").toBeLessThanOrEqual(geo!.vh + 1);
        return `total=${n}; last row index=${n - 1} (data-last=${geo!.last}) in view after ${loops} scrolls at y=${geo!.top.toFixed(0)}–${geo!.bottom.toFixed(0)} of ${geo!.vh}; rendered rows=${geo!.rendered}; scrollY=${geo!.scrollY}/${geo!.docH}; "${geo!.text}"`;
      });
    });
  });
}

test.afterAll(() => {
  const f = path.join(RESULTS_DIR, `qa-${AGENT}.json`);
  if (!fs.existsSync(f)) return;
  const rows = JSON.parse(fs.readFileSync(f, "utf8")) as { check: string; viewport: string; status: string; evidence_url: string; detail?: string }[];
  const pad = (s: string, n: number) => (s.length >= n ? s : s + " ".repeat(n - s.length));
  console.log("\nQA-A results (" + f + "):");
  console.log(pad("check", 30) + pad("viewport", 10) + pad("status", 7) + "evidence");
  for (const r of rows) console.log(pad(r.check, 30) + pad(r.viewport, 10) + pad(r.status, 7) + r.evidence_url);
});
