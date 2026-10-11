import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "https://sb-1z9qy0mx48sk.vercel.run";

export default defineConfig({
  testDir: "./e2e",
  timeout: 240_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 2,
  fullyParallel: true,
  reporter: [["list"], ["json", { outputFile: "test-results/results.json" }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      executablePath: process.env.CHROME_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
    },
  },
  projects: [
    {
      name: "desktop",
      testIgnore: /mobile\.spec\.ts|qa-final\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, defaultBrowserType: "chromium" },
    },
    {
      // Run-UX e2e at 390 px (uploads, stream order, artifacts) — same spec as desktop, mobile viewport + touch.
      name: "mobile-ux",
      testMatch: /run-ux\.spec\.ts/,
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, defaultBrowserType: "chromium" },
    },
    {
      // Lane G QA-final state capture, desktop 1440×900 (run with --workers=1; writes web/proof/qa-final/<QA_LABEL>/).
      name: "qa-final",
      testMatch: /qa-final\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      // Lane G QA-final state capture, mobile 390×844 (Pixel 7, touch).
      name: "qa-final-mobile",
      testMatch: /qa-final\.spec\.ts/,
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, defaultBrowserType: "chromium" },
    },
  ],
});
