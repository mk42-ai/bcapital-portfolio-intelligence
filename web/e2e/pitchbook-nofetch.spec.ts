import { test, expect, type Page } from "./helpers";
import { attachNetworkLog, type NetworkLog } from "./fixtures/network-log";

/**
 * PitchBook "zero network on first paint" (Agent 27).
 *
 * Render path under test (see web/docs/PITCHBOOK_RENDER.md):
 *   • /company/<slug>  — PitchbookPanel is a SERVER component: it calls getPitchbook() on the server and the record is in the HTML.
 *                        The browser must therefore issue NO request to /api/pitchbook/* or /pitchbook/* while loading the page.
 *   • /chat            — the chat page pre-fetches the records for the default context companies server-side and hands them to the
 *                        inspector drawer (`initial`), so opening the drawer paints PitchBook content for the first default company
 *                        ("perplexity-ai") WITHOUT a client fetch. A fetch is only allowed for a non-default company.
 *
 * Robustness: selectors are data-testid only; on the OLD preview (no inspector-toggle / still shows "Run now") the build-specific
 * assertions are soft-skipped with an annotation — but the zero-fetch assertions run everywhere and MUST fail on the new build if a
 * PitchBook fetch happens. Both desktop (project viewport) and a 390×844 mobile viewport are covered.
 */
const SLUG = "1au";
const FIRST_DEFAULT = "perplexity-ai";
const RENDERED = /data-testid="(pb-view|pb-empty|pb-field-empty)"/;
const EXEC_ID = /(?:>|\s)execution [0-9a-f]{24}(?:\s*·\s*(?:executing|queued|running))/i; // visible "execution <id> · executing" status text, not the stored provenance note inside the serialised record
const PB_CONTENT = '[data-testid="pb-view"], [data-testid="pb-empty"], [data-testid="pb-field-empty"]';
/** Markers that only exist on the merged build (Agents 8/25/26): synced badge, honest per-field empty state, no "Run now". */
const isNewBuildHtml = (html: string) => /data-testid="(pb-synced|pb-field-empty)"/.test(html) || !/data-testid="pb-run-now"/.test(html);

function annotate(note: string) { test.info().annotations.push({ type: "pitchbook-nofetch", description: note }); }

async function companyPageScenario(page: Page, log: NetworkLog, html: string) {
  // (a) synchronous render: the server HTML already carries the PitchBook view (or an honest empty state) — no client round trip needed.
  expect(html, "server HTML of /company/1au contains pb-view | pb-empty | pb-field-empty").toMatch(RENDERED);
  expect(html, "server HTML never leaks an execution id").not.toMatch(EXEC_ID);
  const newBuild = isNewBuildHtml(html);
  if (newBuild) expect(html, '"Run now" button removed from the PitchBook card').not.toContain("Run now");
  else annotate('old build detected (pb-run-now present, no pb-synced/pb-field-empty) — "Run now" copy assertion skipped');

  // (b) zero PitchBook network from navigation start until the network is idle.
  await page.goto(`/company/${SLUG}`, { waitUntil: "load" });
  await log.settle();
  const card = page.getByTestId("pitchbook-card");
  await expect(card).toBeVisible();
  await expect(card.locator(PB_CONTENT).first()).toBeVisible();
  await expect(card.getByTestId("pb-loading")).toHaveCount(0);
  const pb = log.pitchbook();
  annotate(`company page requests: ${log.requests.length} total, pitchbook: ${log.describe(pb)}`);
  expect(pb, `no /api/pitchbook or /pitchbook requests on /company/${SLUG} — got: ${log.describe(pb)}`).toEqual([]);
  if (newBuild) {
    await expect(card.getByText("Run now", { exact: false })).toHaveCount(0);
    await expect(card.getByText(EXEC_ID)).toHaveCount(0);
  }
}

async function chatDrawerScenario(page: Page, log: NetworkLog) {
  await page.goto("/chat?skip=1", { waitUntil: "load" });
  await expect(page.getByTestId("chat-shell")).toBeVisible({ timeout: 30_000 });
  // Nothing may fetch PitchBook data before first paint — regardless of build.
  const beforeOpen = log.pitchbook();
  const toggle = page.getByTestId("inspector-toggle");
  if (!(await toggle.count())) {
    // OLD build: no inspector drawer; the right rail hosts the PitchBook card. Exercise it for the annotation and soft-skip.
    const railToggle = page.getByTestId("rail-toggle");
    if (await railToggle.count()) {
      const rail = page.getByTestId("chat-rail");
      if ((await rail.count()) && (await rail.getAttribute("data-collapsed")) === "true") await railToggle.click();
    }
    await log.settle();
    annotate(`old build (no inspector-toggle): pitchbook requests before paint = ${log.describe(beforeOpen)}; after rail = ${log.describe()}`);
    test.skip(true, "inspector-toggle absent — old build without the server-rendered PitchBook drawer");
    return;
  }
  expect(beforeOpen, `no PitchBook fetch before the drawer opens — got: ${log.describe(beforeOpen)}`).toEqual([]);

  const drawer = page.getByTestId("chat-inspector");
  if ((await drawer.getAttribute("data-open")) !== "true") {
    if (!(await toggle.isVisible())) { annotate("inspector-toggle present but not visible at this viewport — drawer scenario skipped"); test.skip(true, "inspector-toggle hidden at this viewport"); return; }
    await toggle.click();
  }
  await expect(drawer).toHaveAttribute("data-open", "true");
  const rail = drawer.getByTestId("pitchbook-rail");
  await expect(rail).toBeVisible();
  // Initial content is painted synchronously from the server-provided record: never the loading state, never offline for the default company.
  await expect(rail.locator(PB_CONTENT).first()).toBeVisible();
  await expect(rail.getByTestId("pb-loading")).toHaveCount(0);
  await expect(rail.getByTestId("pb-no-context")).toHaveCount(0);
  await expect(rail).toContainText(/perplexity/i);
  await expect(rail.getByText(EXEC_ID)).toHaveCount(0);
  await log.settle();
  const all = log.pitchbook();
  const forDefault = all.filter((r) => new RegExp(`/pitchbook/${FIRST_DEFAULT}(?:[/?#]|$)`, "i").test(r.url));
  const others = all.filter((r) => !forDefault.includes(r));
  annotate(`chat drawer: ${log.requests.length} requests; pitchbook for ${FIRST_DEFAULT}: ${log.describe(forDefault)}; other pitchbook: ${log.describe(others)}`);
  expect(forDefault, `zero PitchBook requests for the default first company "${FIRST_DEFAULT}" — got: ${log.describe(forDefault)}`).toEqual([]);
  // The server only pre-fetches the DEFAULT context companies; with primeSettings (defaults) nothing else should be requested either.
  expect(all, `zero PitchBook requests with the default context companies — got: ${log.describe(all)}`).toEqual([]);
}

for (const vp of [{ name: "desktop", size: null }, { name: "mobile 390×844", size: { width: 390, height: 844 } }] as const) {
  test.describe(`PitchBook zero-network first paint · ${vp.name}`, () => {
    test.beforeEach(async ({ page }) => { if (vp.size) await page.setViewportSize(vp.size); });

    test(`/company/${SLUG} renders the PitchBook record from server HTML with zero /pitchbook requests`, async ({ page, request }) => {
      const res = await request.get(`/company/${SLUG}`);
      expect(res.ok(), `GET /company/${SLUG} → ${res.status()}`).toBeTruthy();
      const html = await res.text();
      test.skip(!/data-testid="pitchbook-card"/.test(html), "company page has no PitchBook card on this build");
      const log = attachNetworkLog(page);
      try { await companyPageScenario(page, log, html); } finally { log.detach(); }
    });

    test("/chat inspector drawer paints PitchBook for the default company without a client fetch", async ({ page }) => {
      const log = attachNetworkLog(page);
      try { await chatDrawerScenario(page, log); } finally { log.detach(); }
    });
  });
}
