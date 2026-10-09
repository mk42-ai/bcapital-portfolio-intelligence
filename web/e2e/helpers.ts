import { test as base, expect, type Page, type TestInfo } from "@playwright/test";

export const SETTINGS_KEY = "bcap.settings.v1";
export const COMPANIES = ["perplexity-ai", "apptronik", "fervo-energy", "flutterwave", "writer"];

/** Mark onboarding done (and optionally inject the apikey) before the app boots, so tests land on the real pages. */
export async function primeSettings(page: Page, extra: Record<string, unknown> = {}) {
  const key = process.env.ONDEMAND_API_KEY ?? process.env.ON_DEMAND_API_KEY ?? "";
  await page.addInitScript(
    ([k, v]) => {
      localStorage.setItem(k as string, JSON.stringify(v));
    },
    [
      SETTINGS_KEY,
      {
        onboarded: true,
        apikey: key,
        externalUserId: "INV-001",
        model: "predefined-claude-fable-5.1",
        theme: "light",
        companies: COMPANIES,
        ...extra,
      },
    ],
  );
}

export const hasKey = () => !!(process.env.ONDEMAND_API_KEY ?? process.env.ON_DEMAND_API_KEY);

/** Errors that are noise in a preview/sandbox environment and must not fail a spec. */
const ALLOW = [/favicon/i, /net::ERR_ABORTED/i, /ERR_BLOCKED_BY_ORB/i, /Failed to load resource.*404/i];

export function isAllowed(msg: string) {
  return ALLOW.some((re) => re.test(msg));
}

/** Attach pageerror/console-error capture; returns the live error list. */
export function captureErrors(page: Page): string[] {
  const errs: string[] = [];
  page.on("pageerror", (e) => {
    const m = "pageerror: " + e.message;
    if (!isAllowed(m)) errs.push(m);
  });
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = "console: " + m.text().slice(0, 300);
    if (!isAllowed(t)) errs.push(t);
  });
  return errs;
}

/** Shared fixture: primes settings, captures client errors, asserts none after each test. */
export const test = base.extend<{ errors: string[]; prime: void }>({
  prime: [
    async ({ page }, use) => {
      await primeSettings(page);
      await use();
    },
    { auto: true },
  ],
  errors: [
    async ({ page }, use, testInfo: TestInfo) => {
      const errs = captureErrors(page);
      await use(errs);
      if (errs.length) {
        testInfo.annotations.push({ type: "client-errors", description: errs.slice(0, 10).join(" | ") });
      }
      expect(errs, "no client-side page/console errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** True when the page has no horizontal overflow at the current viewport. */
export async function noHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

export const SCREENS: { path: string; name: string }[] = [
  { path: "/onboarding", name: "onboarding" },
  { path: "/overview", name: "overview" },
  { path: "/company/fervo-energy", name: "company" },
  { path: "/news", name: "news" },
  { path: "/settings", name: "settings" },
  { path: "/chat?skip=1", name: "chat" },
];
