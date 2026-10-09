import { defineConfig, devices } from "@playwright/test";
/** E2E against a running deployment (BASE_URL) or the local prod server. Chromium only — the pod ships system Chromium at CHROME_PATH. */
export default defineConfig({
  testDir: "./tests", timeout: 180_000, expect: { timeout: 15_000 }, retries: 0, workers: 2, reporter: [["list"], ["json", { outputFile: "test-results/results.json" }]],
  use: { baseURL: process.env.BASE_URL ?? "http://127.0.0.1:3101", trace: "retain-on-failure", screenshot: "only-on-failure", launchOptions: { executablePath: process.env.CHROME_PATH || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage"] } },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }, { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, defaultBrowserType: "chromium" }, testMatch: /mobile\.spec\.ts/ }],
});
