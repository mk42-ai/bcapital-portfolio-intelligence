import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

/**
 * Run-UX recorder project (tests/e2e/run-ux.spec.ts).
 *   RUN_LABEL=before|after  BASE_URL=https://sb-…vercel.run  node node_modules/@playwright/test/cli.js test -c playwright.ux.config.ts
 * Every artifact lands under web/artifacts/: standalone HAR per project (mode:'full', content embedded), Playwright trace (screenshots +
 * DOM snapshots + sources + its own network tab) and video per test under artifacts/<label>/pw/, HTML report under artifacts/<label>/report/.
 */
const LABEL = process.env.RUN_LABEL ?? "before";
const BASE_URL = process.env.BASE_URL ?? "https://sb-70502obas4b3.vercel.run";
const ART = path.resolve(__dirname, "artifacts");

const harFor = (viewport: string) => ({ path: path.join(ART, LABEL, `${viewport}.har`), mode: "full" as const, content: "embed" as const });

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /run-ux\.spec\.ts/,
  outputDir: path.join(ART, LABEL, "pw"),
  timeout: 900_000,
  expect: { timeout: 20_000 },
  retries: 0,
  workers: 2,
  fullyParallel: false,
  reporter: [["list"], ["json", { outputFile: path.join(ART, LABEL, "results.json") }], ["html", { outputFolder: path.join(ART, LABEL, "report"), open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: { mode: "on", screenshots: true, snapshots: true, sources: true },
    video: { mode: "on" },
    screenshot: "off",
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    launchOptions: { executablePath: process.env.CHROME_PATH || "/usr/bin/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, video: { mode: "on", size: { width: 1440, height: 900 } }, contextOptions: { recordHar: harFor("desktop") } } },
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, defaultBrowserType: "chromium", video: { mode: "on", size: { width: 390, height: 844 } }, contextOptions: { recordHar: harFor("mobile") } } },
  ],
});
