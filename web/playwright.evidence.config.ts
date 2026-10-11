import { defineConfig, devices } from "@playwright/test";

/**
 * Evidence suite config — runs e2e/evidence.spec.ts against the LIVE deployment (BASE_URL) with video + trace + screenshot ALWAYS on.
 *   cd web && BASE_URL=https://<frontend> API_URL=https://<backend> npx playwright test -c playwright.evidence.config.ts --workers=1
 * Outputs: proof/evidence/test-results/** (video .webm, trace.zip, screenshots), proof/evidence/html-report, proof/evidence/results.json.
 */
const BASE_URL = process.env.BASE_URL ?? "https://sb-485hwxjqqz7l.vercel.run";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /evidence\.spec\.ts/,
  timeout: 300_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  fullyParallel: false,
  outputDir: "proof/evidence/test-results",
  reporter: [
    ["list"],
    ["html", { outputFolder: "proof/evidence/html-report", open: "never" }],
    ["json", { outputFile: "proof/evidence/results.json" }],
  ],
  use: {
    baseURL: BASE_URL,
    video: "on",
    trace: "on",
    screenshot: "on",
    launchOptions: {
      executablePath: process.env.CHROME_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    },
  },
  projects: [
    { name: "evidence-desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "evidence-mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, defaultBrowserType: "chromium" } },
  ],
});
